import { useGuaranteeConfig } from '@repo/core/api/hooks/use-guarantee';
import { useT, useTn } from '@repo/core/i18n';
import { SUPPORT_PHONE_DISPLAY, SUPPORT_TEL_HREF, supportWhatsAppHref } from '@repo/core/support';
import { ScButton } from '@repo/native-ui/button';
import { IconChevronDown, IconSearch } from '@repo/native-ui/icons';
import { ScCard } from '@repo/native-ui/primitives';
import { T } from '@repo/native-ui/text';
import { createStyles, useColors } from '@repo/native-ui/theme';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContactButtons } from '@/components/booking/help-sheet';
import { RaiseComplaintSheet } from '@/components/complaints/raise-complaint-sheet';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth';
import { HELP_DRAFT, HELP_INTRO, HELP_STILL_NEED, helpGroupsFor, type HelpQuestion } from '@/lib/help-content';
import { countQuestions, searchHelp } from '@/lib/help-search';
import { track } from '@/lib/shims/analytics';

/** A link in an answer: an app screen goes there, a legal page opens in the browser. */
function openHelpLink(href: string) {
  if (/^\/(terms|privacy|refund-policy|service-delivery|contact)/.test(href)) void WebBrowser.openBrowserAsync(`https://detlio.com${href}`);
  else router.push(href as Href);
}

function Question({ question, open: forced }: { question: HelpQuestion; open: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const [open, setOpen] = useState(forced);
  return (
    <View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.question}>
        <T size={14} lh={20} style={styles.grow}>
          {question.q}
        </T>
        <View style={open ? styles.flipped : undefined}>
          <IconChevronDown size={18} color={colors.textMuted} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.answer}>
          {question.a.map((paragraph, index) => (
            <T key={index} size={13} lh={20} color={colors.textSecondary}>
              {paragraph}
            </T>
          ))}
          {question.links?.length ? (
            <View style={styles.links}>
              {question.links.map((link) => (
                <T key={link.href} size={13} weight={500} lh={20} accessibilityRole="link" style={styles.underline} onPress={() => openHelpLink(link.href)}>
                  {link.label}
                </T>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** HelpScreen (apps/users/components/help/help-screen.tsx). */
export default function HelpScreen() {
  const tn = useTn();
  const t = useT();
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const user = useAuth((s) => s.user);
  const params = useLocalSearchParams<{ open?: string }>();
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [raising, setRaising] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearched(query), 150);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => track('help_view', { step: 'contact' }), []);
  const searching = searched.trim().length > 0;
  const guaranteeOn = useGuaranteeConfig().data?.enabled === true;
  const groups = searchHelp(helpGroupsFor({ guarantee: guaranteeOn }), searched);
  const found = countQuestions(groups);

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <PageHeader title={t(HELP_INTRO.title)} backTo="/profile" />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {HELP_DRAFT ? (
          <T size={12} lh={16} color={colors.warning}>
            {t('Draft: these answers are waiting for sign-off.')}
          </T>
        ) : null}
        <T size={13} lh={18} color={colors.textSecondary}>
          {t(HELP_INTRO.body)}
        </T>
        <View style={styles.search}>
          <IconSearch size={18} color={colors.textMuted} />
          <TextInput
            accessibilityLabel={t(HELP_INTRO.searchLabel)}
            placeholder={t(HELP_INTRO.searchPlaceholder)}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={colors.keyboard}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={styles.input}
          />
        </View>
        {searching ? (
          <T accessibilityLiveRegion="polite" size={13} lh={18} color={colors.textSecondary}>
            {found === 0 ? t(HELP_INTRO.noResults) : tn(found, '{count} answer found', '{count} answers found')}
          </T>
        ) : null}
        {groups.map((group) => (
          <View key={group.id} style={styles.group}>
            <T size={14} weight={600} lh={20}>
              {group.title}
            </T>
            <ScCard style={styles.list}>
              {group.questions.map((question, index) => (
                <View key={`${question.id}:${searching}`} style={index > 0 ? styles.line : undefined}>
                  <Question question={question} open={searching || question.id === params.open} />
                </View>
              ))}
            </ScCard>
          </View>
        ))}
        <ScCard style={styles.still}>
          <View>
            <T size={14} weight={600} lh={20}>
              {t(HELP_STILL_NEED.title)}
            </T>
            <T size={13} lh={18} color={colors.textSecondary} style={styles.mt2}>
              {t(HELP_STILL_NEED.body, { phone: SUPPORT_PHONE_DISPLAY })}
            </T>
          </View>
          <ContactButtons who={t('Detlio support')} callHref={SUPPORT_TEL_HREF} whatsApp={supportWhatsAppHref('Hi Detlio, I have a question.')} />
          <View style={styles.pair}>
            <View style={styles.grow}>
              <ScButton variant="outline" height={44} paddingX={8} onPress={() => openHelpLink(HELP_STILL_NEED.contact.href)}>
                {t(HELP_STILL_NEED.contact.label)}
              </ScButton>
            </View>
            <View style={styles.grow}>
              <ScButton
                variant="outline"
                height={44}
                paddingX={8}
                onPress={() => {
                  if (user) setRaising(true);
                  else router.push(`/login?next=${encodeURIComponent('/help')}` as Href);
                }}
              >
                {t(HELP_STILL_NEED.complaint.label)}
              </ScButton>
            </View>
          </View>
        </ScCard>
      </ScrollView>
      <RaiseComplaintSheet open={raising} onClose={() => setRaising(false)} booking={null} />
    </View>
  );
}

const useStyles = createStyles((c) => ({
  page: { flex: 1, backgroundColor: c.canvas },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 12 },
  input: { flex: 1, minHeight: 44, fontSize: 15, color: c.textPrimary },
  group: { gap: 8 },
  list: { paddingVertical: 0 },
  line: { borderTopWidth: 1, borderTopColor: c.line },
  question: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  flipped: { transform: [{ rotate: '180deg' }] },
  grow: { flex: 1, minWidth: 0 },
  answer: { gap: 8, paddingBottom: 12 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  underline: { textDecorationLine: 'underline' },
  still: { gap: 12 },
  mt2: { marginTop: 2 },
  pair: { flexDirection: 'row', gap: 8 },
}));
