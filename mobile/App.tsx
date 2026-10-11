import { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, Alert, ScrollView, Image, ActivityIndicator, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import { clearSession, login, register, restoreSession, setSessionExpiredHandler, uploadDocument, getDocuments, getDocument, searchDocuments, askQuestion, listConversations, createConversation, getConversation, sendMessage, verify2FA } from './src/api';
import { registerForPushNotifications } from './src/push';

type Screen = 'docs' | 'search' | 'ask' | 'detail';

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('docs');
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [capture, setCapture] = useState<{ uri: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  useEffect(() => {
    restoreSession().then(t => {
      setToken(t);
      setLoading(false);
      if (t) attemptBiometric();
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => setToken(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (token) registerForPushNotifications();
  }, [token]);

  async function attemptBiometric() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHardware && enrolled) {
      setLocked(true);
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock DocVault' });
      setLocked(!result.success);
    }
  }

  if (loading) return <View style={s.center}><StatusBar barStyle="light-content" /><ActivityIndicator color={colors.primary} /></View>;
  if (!token) return <AuthScreen onAuth={setToken} />;
  if (locked) return (
    <View style={s.center}>
      <StatusBar barStyle="light-content" />
      <Text style={s.lockIcon}>🔒</Text>
      <Text style={s.lockTitle}>DocVault is locked</Text>
      <TouchableOpacity style={s.btn} onPress={attemptBiometric}><Text style={s.btnText}>Unlock</Text></TouchableOpacity>
    </View>
  );

  if (capture) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" />
        <Text style={s.screenTitle}>Confirm Document</Text>
        <Image source={{ uri: capture.uri }} style={s.preview} resizeMode="contain" />
        {uploading ? (
          <View style={s.uploadingBox}>
            <ActivityIndicator color={colors.primary} />
            <Text style={s.mutedText}>Processing — OCR & AI extraction...</Text>
          </View>
        ) : (
          <View style={s.confirmRow}>
            <TouchableOpacity style={s.btnOutline} onPress={() => setCapture(null)}>
              <Text style={s.btnOutlineText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={confirmUpload}>
              <Text style={s.btnText}>Upload</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Text style={s.brand}>DocVault</Text>
        <TouchableOpacity onPress={async () => { await clearSession(); setToken(null); }}>
          <Text style={s.headerLink}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      {screen === 'docs' && <DocsScreen onSelect={(id) => { setSelectedDocId(id); setScreen('detail'); }} />}
      {screen === 'search' && <SearchScreen onSelect={(id) => { setSelectedDocId(id); setScreen('detail'); }} />}
      {screen === 'ask' && <AskScreen />}
      {screen === 'detail' && selectedDocId && <DetailScreen docId={selectedDocId} onBack={() => setScreen('docs')} />}
      {screen !== 'detail' && (
        <View style={s.tabs}>
          <TabBtn label="📄 Docs" active={screen === 'docs'} onPress={() => setScreen('docs')} />
          <TabBtn label="🔍 Search" active={screen === 'search'} onPress={() => setScreen('search')} />
          <TabBtn label="📷 Scan" active={false} onPress={handleCapture} />
          <TabBtn label="💬 Ask" active={screen === 'ask'} onPress={() => setScreen('ask')} />
        </View>
      )}
    </View>
  );

  async function handleCapture() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission needed'); return; }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!result.canceled) setCapture({ uri: result.assets[0].uri });
  }

  async function confirmUpload() {
    if (!capture) return;
    setUploading(true);
    try {
      await uploadDocument(capture.uri, 'scan.jpg');
      Alert.alert('Success', 'Document uploaded and being processed');
      setCapture(null);
      setScreen('docs');
    } catch {
      Alert.alert('Error', 'Upload failed');
    } finally {
      setUploading(false);
    }
  }
}

// === Auth Screen ===
function AuthScreen({ onAuth }: { onAuth: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [verificationSent, setVerificationSent] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      Alert.alert('Missing details', 'Enter your email address and password.');
      return;
    }
    if (!isLogin && password.length < 8) {
      Alert.alert('Password too short', 'Use at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      if (requires2FA) {
        if (!/^\d{6}$/.test(code)) {
          Alert.alert('Invalid code', 'Enter the 6-digit code from your authenticator app.');
          return;
        }
        onAuth(await verify2FA(email.trim(), password, code));
      } else if (isLogin) {
        const result = await login(email.trim(), password);
        if (result.requires2FA) setRequires2FA(true);
        else onAuth(result.accessToken);
      } else {
        await register(email.trim(), password);
        setVerificationSent(true);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  }

  if (verificationSent) {
    return (
      <View style={s.authContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={s.authBrand}>Check your email</Text>
        <Text style={[s.authSubtitle, { textAlign: 'center' }]}>Open the verification link, then return here to sign in.</Text>
        <TouchableOpacity style={s.btn} onPress={() => { setVerificationSent(false); setIsLogin(true); }}>
          <Text style={s.btnText}>Continue to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.authContainer}>
      <StatusBar barStyle="light-content" />
      <Text style={s.authBrand}>DocVault</Text>
      <Text style={s.authSubtitle}>{requires2FA ? 'Enter your authenticator code' : isLogin ? 'Sign in to your account' : 'Create a new account'}</Text>
      <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} secureTextEntry />
      {requires2FA && <TextInput style={s.input} placeholder="6-digit code" placeholderTextColor={colors.muted} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />}
      <TouchableOpacity style={[s.btn, busy && { opacity: 0.6 }]} onPress={handleSubmit} disabled={busy}>
        <Text style={s.btnText}>{busy ? 'Please wait…' : requires2FA ? 'Verify' : isLogin ? 'Sign In' : 'Sign Up'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => { setIsLogin(!isLogin); setRequires2FA(false); setCode(''); }} disabled={busy}>
        <Text style={s.link}>{isLogin ? 'Create account' : 'Sign in instead'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// === Documents List ===
function DocsScreen({ onSelect }: { onSelect: (id: string) => void }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocuments().then(d => { setDocs(d.documents || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <FlatList
      data={docs}
      keyExtractor={item => item.id}
      contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
      ListEmptyComponent={
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>📄</Text>
          <Text style={s.emptyTitle}>No documents yet</Text>
          <Text style={s.emptyDesc}>Tap Scan to photograph a document</Text>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity style={s.card} onPress={() => onSelect(item.id)} activeOpacity={0.7}>
          <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
          <View style={s.cardMeta}>
            {item.brand && <Text style={s.badge}>{item.brand}</Text>}
            {item.document_type && <Text style={s.badge}>{item.document_type}</Text>}
            {item.processing_status === 'pending' && <Text style={s.badgeProcessing}>Processing...</Text>}
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

// === Document Detail ===
function DetailScreen({ docId, onBack }: { docId: string; onBack: () => void }) {
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocument(docId).then(d => { setDoc(d); setLoading(false); }).catch(() => setLoading(false));
  }, [docId]);

  if (loading) return <View style={s.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!doc || !doc.id) return (
    <View style={s.center}>
      <Text style={s.emptyTitle}>Document not found</Text>
      <TouchableOpacity style={s.btn} onPress={onBack}><Text style={s.btnText}>Go back</Text></TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <TouchableOpacity onPress={onBack} style={{ marginBottom: 16 }}>
        <Text style={s.link}>← Back</Text>
      </TouchableOpacity>
      <Text style={s.detailTitle}>{doc.title}</Text>
      <View style={s.detailMeta}>
        {doc.brand && <Text style={s.badge}>{doc.brand}</Text>}
        {doc.model && <Text style={s.badge}>{doc.model}</Text>}
        {doc.document_type && <Text style={s.badge}>{doc.document_type}</Text>}
      </View>

      {doc.summary && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>AI Summary</Text>
          <Text style={s.sectionText}>{typeof doc.summary === 'string' && doc.summary.startsWith('{') ? JSON.parse(doc.summary).overview : doc.summary}</Text>
        </View>
      )}

      {doc.raw_text && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Extracted Text</Text>
          <Text style={s.sectionText} numberOfLines={20}>{doc.raw_text}</Text>
        </View>
      )}

      {doc.image_url && !doc.image_url.includes('.pdf') && (
        <Image source={{ uri: doc.image_url }} style={s.detailImage} resizeMode="contain" />
      )}
    </ScrollView>
  );
}

// === Search Screen ===
function SearchScreen({ onSelect }: { onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchDocuments(query);
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={s.searchRow}>
        <TextInput
          style={[s.input, { flex: 1, marginBottom: 0 }]}
          placeholder="Search documents..."
          placeholderTextColor={colors.muted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={[s.btn, { marginLeft: 8, paddingHorizontal: 20 }]} onPress={handleSearch}>
          <Text style={s.btnText}>Go</Text>
        </TouchableOpacity>
      </View>
      {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />}
      {!loading && searched && results.length === 0 && (
        <View style={s.emptyState}>
          <Text style={s.emptyTitle}>No results found</Text>
          <Text style={s.emptyDesc}>Try different keywords</Text>
        </View>
      )}
      <FlatList
        data={results}
        keyExtractor={(_, i) => i.toString()}
        style={{ marginTop: 12 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => onSelect(item.document_id)} activeOpacity={0.7}>
            <Text style={s.cardTitle} numberOfLines={1}>{item.document_title}</Text>
            <Text style={s.resultSnippet} numberOfLines={2}>{item.chunk_text}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// === Ask AI Screen with Conversation Persistence ===
function AskScreen() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load most recent conversation on mount
  useEffect(() => {
    listConversations().then(convs => {
      const recent = convs.filter((c: any) => !c.title.startsWith('[')).sort((a: any, b: any) => b.updated_at.localeCompare(a.updated_at))[0];
      if (recent) {
        setConversationId(recent.id);
        getConversation(recent.id).then(data => {
          setMessages(data.messages.map((m: any) => ({ role: m.role, content: m.content })));
        });
      }
    }).catch(() => {});
  }, []);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const question = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    try {
      let convId = conversationId;
      if (!convId) {
        const conv = await createConversation();
        convId = conv.id;
        setConversationId(convId);
      }
      const data = await sendMessage(convId!, question);
      setMessages(prev => [...prev, { role: 'assistant', content: data.assistant_message.content }]);
    } catch {
      try {
        const data = await askQuestion(question);
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      } catch {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
      }
    } finally {
      setLoading(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setConversationId(null);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <View style={{ flex: 1 }}>
        <View style={s.askHeader}>
          <Text style={s.askHeaderText}>Ask AI</Text>
          <TouchableOpacity onPress={startNewChat}><Text style={s.link}>New chat</Text></TouchableOpacity>
        </View>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(_, i) => i.toString()}
          contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>💬</Text>
              <Text style={s.emptyTitle}>Ask anything about your documents</Text>
              <Text style={s.emptyDesc}>AI answers are grounded in your uploaded files</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[s.msgBubble, item.role === 'user' ? s.userBubble : s.aiBubble]}>
              <Text style={[s.msgText, item.role === 'user' ? s.userText : s.aiText]}>{item.content}</Text>
            </View>
          )}
        />
        {loading && <ActivityIndicator color={colors.primary} style={{ paddingBottom: 8 }} />}
        <View style={s.inputRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Ask a question..."
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity style={[s.btn, { marginLeft: 8, paddingHorizontal: 20 }]} onPress={handleSend} disabled={loading}>
            <Text style={s.btnText}>↑</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// === Tab Button ===
function TabBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.tab, active && s.tabActive]} onPress={onPress}>
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

// === Colors & Styles ===
const colors = {
  bg: '#0f0f11',
  card: '#1a1a1f',
  border: '#2a2a30',
  primary: '#7c3aed',
  primaryLight: '#a78bfa',
  text: '#f0f0f2',
  muted: '#8a8a95',
  mutedBg: '#25252b',
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: 50 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 16 },
  lockIcon: { fontSize: 40, marginBottom: 8 },
  lockTitle: { fontSize: 18, fontWeight: '600', color: colors.text },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { fontSize: 20, fontWeight: '700', color: colors.text },
  headerLink: { fontSize: 14, color: colors.primaryLight },
  screenTitle: { fontSize: 18, fontWeight: '600', color: colors.text, padding: 16 },
  authContainer: { flex: 1, justifyContent: 'center', padding: 32, backgroundColor: colors.bg },
  authBrand: { fontSize: 28, fontWeight: '700', textAlign: 'center', color: colors.text },
  authSubtitle: { fontSize: 14, color: colors.muted, textAlign: 'center', marginBottom: 24, marginTop: 4 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 12, fontSize: 15, color: colors.text, backgroundColor: colors.card },
  btn: { backgroundColor: colors.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnOutline: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, alignItems: 'center', flex: 1, marginRight: 10 },
  btnOutlineText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  link: { color: colors.primaryLight, textAlign: 'center', fontSize: 14, fontWeight: '500' },
  preview: { flex: 1, margin: 16, borderRadius: 12, backgroundColor: colors.card },
  confirmRow: { flexDirection: 'row', padding: 16 },
  uploadingBox: { padding: 24, alignItems: 'center', gap: 12 },
  mutedText: { color: colors.muted, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  cardMeta: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  badge: { backgroundColor: colors.mutedBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, color: colors.primaryLight, overflow: 'hidden' },
  badgeProcessing: { backgroundColor: '#422006', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, fontSize: 12, color: '#fbbf24', overflow: 'hidden' },
  resultSnippet: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  emptyDesc: { fontSize: 13, color: colors.muted, marginTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  // Detail
  detailTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 12 },
  detailMeta: { flexDirection: 'row', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  detailImage: { width: '100%', height: 300, borderRadius: 12, backgroundColor: colors.card, marginTop: 16 },
  section: { backgroundColor: colors.card, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.primaryLight, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionText: { fontSize: 14, color: colors.text, lineHeight: 22 },
  // Ask
  askHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  askHeaderText: { fontSize: 16, fontWeight: '600', color: colors.text },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderTopWidth: 1, borderTopColor: colors.border },
  msgBubble: { borderRadius: 16, padding: 12, marginBottom: 10, maxWidth: '85%' },
  userBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: colors.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  msgText: { fontSize: 14, lineHeight: 20 },
  userText: { color: '#fff' },
  aiText: { color: colors.text },
  // Tabs
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  tab: { flex: 1, padding: 14, alignItems: 'center' },
  tabActive: { borderTopWidth: 2, borderTopColor: colors.primary },
  tabText: { fontSize: 13, color: colors.muted },
  tabTextActive: { color: colors.primaryLight, fontWeight: '600' },
});
