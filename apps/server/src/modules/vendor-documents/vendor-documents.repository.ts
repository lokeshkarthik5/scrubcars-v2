import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { vendorDocumentFiles, vendorDocuments, vendors } from '../../db/schema.js'
import type {
  DocumentContentType,
  DocumentSide,
  DocumentStatus,
  DocumentType,
} from '../../lib/vendor-documents.js'

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Conn = typeof db | Tx

export type DocumentRecord = typeof vendorDocuments.$inferSelect
export type DocumentFileRecord = typeof vendorDocumentFiles.$inferSelect

export interface GarageRow {
  id: string
  businessName: string
  deletedAt: Date | null
  purgedAt: Date | null
}

/** Reads, through the plain connection or the transaction. */
function reads(conn: Conn) {
  return {
    async findGarage(vendorId: string): Promise<GarageRow | undefined> {
      const [row] = await conn
        .select({
          id: vendors.id,
          businessName: vendors.businessName,
          deletedAt: vendors.deletedAt,
          purgedAt: vendors.purgedAt,
        })
        .from(vendors)
        .where(eq(vendors.id, vendorId))
        .limit(1)
      return row
    },

    /** The garage's documents, one per type at most. */
    listDocuments(vendorId: string): Promise<DocumentRecord[]> {
      return conn
        .select()
        .from(vendorDocuments)
        .where(eq(vendorDocuments.vendorId, vendorId))
        .orderBy(asc(vendorDocuments.createdAt))
    },

    listFiles(documentIds: string[]): Promise<DocumentFileRecord[]> {
      if (documentIds.length === 0) return Promise.resolve([])
      return conn
        .select()
        .from(vendorDocumentFiles)
        .where(inArray(vendorDocumentFiles.documentId, documentIds))
        .orderBy(asc(vendorDocumentFiles.side))
    },

    async findDocument(vendorId: string, documentId: string): Promise<DocumentRecord | undefined> {
      const [row] = await conn
        .select()
        .from(vendorDocuments)
        .where(and(eq(vendorDocuments.id, documentId), eq(vendorDocuments.vendorId, vendorId)))
        .limit(1)
      return row
    },

    async findDocumentByType(vendorId: string, type: DocumentType): Promise<DocumentRecord | undefined> {
      const [row] = await conn
        .select()
        .from(vendorDocuments)
        .where(and(eq(vendorDocuments.vendorId, vendorId), eq(vendorDocuments.type, type)))
        .limit(1)
      return row
    },

    /**
     * One file, only through its document and only when that document is
     * the given garage's: another garage's file id is not found.
     */
    async findFile(
      vendorId: string,
      documentId: string,
      fileId: string
    ): Promise<{ storageKey: string; contentType: DocumentContentType } | undefined> {
      const [row] = await conn
        .select({
          storageKey: vendorDocumentFiles.storageKey,
          contentType: vendorDocumentFiles.contentType,
        })
        .from(vendorDocumentFiles)
        .innerJoin(vendorDocuments, eq(vendorDocuments.id, vendorDocumentFiles.documentId))
        .where(
          and(
            eq(vendorDocumentFiles.id, fileId),
            eq(vendorDocumentFiles.documentId, documentId),
            eq(vendorDocuments.vendorId, vendorId)
          )
        )
        .limit(1)
      return row
    },

    /** How many of the garage's documents wait for Detlio. */
    async countPending(vendorId: string): Promise<number> {
      const [row] = await conn
        .select({ n: sql<number>`count(*)::int` })
        .from(vendorDocuments)
        .where(and(eq(vendorDocuments.vendorId, vendorId), eq(vendorDocuments.status, 'pending')))
      return row?.n ?? 0
    },

    /**
     * Every garage's documents as type and status only, for the admin
     * list's chip and checklist. Never a file or a key. Tombstones left out.
     */
    listAllStates(): Promise<Array<{ vendorId: string; type: DocumentType; status: DocumentStatus }>> {
      return conn
        .select({
          vendorId: vendorDocuments.vendorId,
          type: vendorDocuments.type,
          status: vendorDocuments.status,
        })
        .from(vendorDocuments)
        .innerJoin(vendors, eq(vendors.id, vendorDocuments.vendorId))
        .where(isNull(vendors.purgedAt))
    },
  }
}

/** The writes, inside the transaction that submits or reviews a document. */
function writes(tx: Tx) {
  return {
    /**
     * One garage's documents, one change at a time:
     * `pg_advisory_xact_lock('documents:<garage>')`, so two uploads of the
     * same type (two tabs, a retry) cannot both insert. Taken on its own,
     * never alongside the booking-write locks (AGENTS.md).
     */
    async lockGarageDocuments(vendorId: string) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`documents:${vendorId}`})::bigint)`)
    },

    async insertDocument(values: {
      vendorId: string
      type: DocumentType
      status: DocumentStatus
      expiresOn: string | null
      uploadedBy: string
      uploadedBySub: string
      reviewedBy: string | null
      reviewedBySub: string | null
      reviewedAt: Date | null
    }): Promise<DocumentRecord> {
      const [row] = await tx.insert(vendorDocuments).values(values).returning()
      return row
    },

    /** New files on an existing row: back to the start, one version on. */
    async resubmitDocument(
      id: string,
      values: {
        status: DocumentStatus
        expiresOn: string | null
        uploadedBy: string
        uploadedBySub: string
        reviewedBy: string | null
        reviewedBySub: string | null
        reviewedAt: Date | null
      }
    ): Promise<DocumentRecord> {
      const [row] = await tx
        .update(vendorDocuments)
        .set({
          ...values,
          version: sql`${vendorDocuments.version} + 1`,
          rejectionReason: null,
          submittedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(vendorDocuments.id, id))
        .returning()
      return row
    },

    /** The document's files, deleted; their keys come back for the bucket. */
    async deleteFiles(documentId: string): Promise<string[]> {
      const rows = await tx
        .delete(vendorDocumentFiles)
        .where(eq(vendorDocumentFiles.documentId, documentId))
        .returning({ storageKey: vendorDocumentFiles.storageKey })
      return rows.map((row) => row.storageKey)
    },

    insertFiles(
      rows: Array<{
        documentId: string
        side: DocumentSide
        storageKey: string
        contentType: DocumentContentType
        sizeBytes: number
      }>
    ): Promise<DocumentFileRecord[]> {
      return tx.insert(vendorDocumentFiles).values(rows).returning()
    },

    /**
     * Records a review, only if the document is still the version the admin
     * opened and not already in that state. Undefined when it was not.
     */
    async review(
      vendorId: string,
      documentId: string,
      seenVersion: number,
      values: {
        status: 'approved' | 'rejected'
        rejectionReason: string | null
        reviewedBy: string
        reviewedBySub: string
      }
    ): Promise<DocumentRecord | undefined> {
      const [row] = await tx
        .update(vendorDocuments)
        .set({ ...values, reviewedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            eq(vendorDocuments.id, documentId),
            eq(vendorDocuments.vendorId, vendorId),
            eq(vendorDocuments.version, seenVersion),
            sql`${vendorDocuments.status} <> ${values.status}`
          )
        )
        .returning()
      return row
    },
  }
}

export type DocumentsReads = ReturnType<typeof reads>
export type DocumentsWork = DocumentsReads & ReturnType<typeof writes>

export const vendorDocumentsRepository = {
  ...reads(db),

  transaction<T>(work: (repo: DocumentsWork) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '10s'`)
      return work({ ...reads(tx), ...writes(tx) })
    })
  },
}
