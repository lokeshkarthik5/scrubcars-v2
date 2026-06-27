import { randomUUID } from 'node:crypto'
import { Storage } from '@google-cloud/storage'
import { env } from './env.js'
import { AppError } from './errors.js'

let storageClient: Storage | null = null

function getStorageClient(): Storage {
  if (!storageClient) {
    storageClient = new Storage({
      projectId: env.gcsProjectId,
      credentials: {
        client_email: env.gcsClientEmail,
        private_key: env.gcsPrivateKey,
      },
    })
  }

  return storageClient
}

export type PhotoUploadTarget = {
  objectPath: string
  publicUrl: string
  uploadUrl: string
}

export async function createVendorPhotoUploadUrl(input: {
  vendorId: string
  filename: string
  contentType: string
}): Promise<PhotoUploadTarget> {
  const extension = input.filename.includes('.')
    ? input.filename.slice(input.filename.lastIndexOf('.'))
    : ''
  const objectPath = `vendors/${input.vendorId}/${randomUUID()}${extension}`
  const publicUrl = `https://storage.googleapis.com/${env.gcsBucket}/${objectPath}`

  if (!env.gcsConfigured) {
    if (env.isDev) {
      return {
        objectPath,
        publicUrl,
        uploadUrl: `https://storage.googleapis.com/${env.gcsBucket}/${objectPath}?dev-signed=true`,
      }
    }

    throw new AppError(500, 'GCS is not configured', 'GCS_NOT_CONFIGURED')
  }

  const [uploadUrl] = await getStorageClient()
    .bucket(env.gcsBucket!)
    .file(objectPath)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000,
      contentType: input.contentType,
    })

  return {
    objectPath,
    publicUrl,
    uploadUrl,
  }
}
