<script lang="ts">
  import { createConversationPacer } from '$lib/conversationPacing';
  import { asksToConfirmAddress, isAffirmative, reviewFingerprint as profileFingerprint } from '$lib/signupConfirmation';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import CapitalOneLogo from '../../routes/[view=wallet]/CapitalOneLogo.svelte';
  import SignupChoices from '$lib/components/SignupChoices.svelte';
  import Eno from '$lib/components/Eno.svelte';
  import { emptySpending, spendingPreferencesSchema, spendingComplete, brandedCardName, recommendDemoCard, categoryLabels, type SpendingPreferences, type DemoCard } from '$lib/spending';
  import AddressAutocomplete from '$lib/components/AddressAutocomplete.svelte';
  import { type AddressCandidate, type AddressCheck, type MailingAddress } from '$lib/address';
  import EnoThinking from '$lib/components/EnoThinking.svelte';
  import { accountProduct, products } from '$lib/products';
  import { accountChoiceSchema, accountTypesFor, emptyAnswers, SIGNUP_FIELDS, customerCreateSchema, customerFromAnswers, type AccountChoice, type SignupAnswers, type AccountSelection, type SignupStage } from '$lib/signup';

  interface ChoiceInput { selectedSpending?: SpendingPreferences['categories']; selectedAccounts?: AccountSelection }
  interface Message { id: number; role: 'eno' | 'you'; text: string; review?: SignupAnswers; accountChoice?: AccountChoice; spending?: SpendingPreferences; includeCreditCard?: boolean | null; choices?: 'spending' | 'accounts'; selectedCategories?: SpendingPreferences['categories']; selection?: AccountSelection; recommendedCard?: DemoCard | null; retryChoices?: ChoiceInput; card?: DemoCard | null; retry?: 'turn' | 'signup'; retryText?: string; selectedAddress?: MailingAddress; addressCheck?: AddressCheck; recovery?: boolean; dashboard?: string }
  interface ConversationReply { message: string; answers: SignupAnswers; accountChoice: AccountChoice; spending: SpendingPreferences; includeCreditCard: boolean | null; recommendedCard: DemoCard | null; stage: SignupStage; card: DemoCard | null; ready: boolean; confirmed: boolean; addressCheck?: AddressCheck }
  const draftKey = 'eno-signup-conversation-v2';
  const pacing = createConversationPacer();
  let answers = $state(emptyAnswers());
  let accountChoice = $state<AccountChoice>('undecided');
  let spending = $state<SpendingPreferences>(emptySpending());
  let includeCreditCard = $state<boolean | null>(null);
  let latestChoiceId = $state(0);
  let currentStage = $state<SignupStage>('details');
  let matchingCard = $derived(includeCreditCard === false ? null : recommendDemoCard(spending));
  let readyToCreate = $state(false);
  let messages = $state<Message[]>([{ id: 1, role: 'eno', text: 'Hey, I’m Eno. Really glad you’re here.\n\nLet’s get you set up. What should I call you?' }]);
  let nextId = 1;
  let reply = $state('');
  let autocomplete = $state<AddressAutocomplete>();
  let suggestionsOpen = $state(false);
  let activeAddressId = $state<string>();
  let waiting = $state(false);
  let submitting = $state(false);
  let ready = $state(false);
  let completed = $state(false);
  let latestReviewId = $state(0);
  let reviewFingerprint = '';
  let pendingAddress = $state<MailingAddress>();
  let createdCustomerId = $state('');
  let recovery = $state(false);
  let attemptKey = '';
  let theme = $state<'light' | 'dark' | 'system'>('system');
  let systemDark = $state(false);
  let reducedMotion = false;
  let isDark = $derived(theme === 'dark' || (theme === 'system' && systemDark));
  let busy = $derived(waiting || submitting);
  let input = $state<HTMLInputElement>();
  let scrollArea = $state<HTMLDivElement>();
  let disposed = false;
  let turnController: AbortController | undefined;
  let speechSupported = $state(false);
  let voiceEnabled = $state(false);
  let speaking = $state(false);
  let speechNotice = $state('');
  let currentUtterance: SpeechSynthesisUtterance | undefined;

  async function settle() {
    await tick();
    if (disposed) return;
    scrollArea?.scrollTo({ top: scrollArea.scrollHeight, behavior: reducedMotion ? 'instant' : 'smooth' });
    if (!busy) input?.focus({ preventScroll: true });
  }

  function stopSpeech() {
    if (speechSupported) speechSynthesis.cancel();
    currentUtterance = undefined;
    speaking = false;
  }

  function speak(text: string, interrupt = true) {
    if (!speechSupported) return;
    if (interrupt) stopSpeech();
    speechNotice = '';
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const voice = voices.find((item) => item.lang === 'en-US' && /Samantha|Aria|Google US English/i.test(item.name)) ?? voices.find((item) => item.lang.startsWith('en'));
    if (voice) utterance.voice = voice;
    utterance.lang = 'en-US'; utterance.rate = 1; utterance.pitch = 1.03;
    utterance.onstart = () => { if (!disposed && currentUtterance === utterance) speaking = true; };
    utterance.onend = () => { if (currentUtterance === utterance) speaking = false; };
    utterance.onerror = (event) => { if (currentUtterance === utterance) speaking = false; if (!['interrupted', 'canceled'].includes(event.error)) speechNotice = 'Voice couldn’t start. You can keep chatting here.'; };
    currentUtterance = utterance;
    try { speechSynthesis.speak(utterance); } catch { speechNotice = 'Voice isn’t available right now. You can keep chatting here.'; speaking = false; }
  }

  function toggleVoice() {
    voiceEnabled = !voiceEnabled;
    if (!voiceEnabled) stopSpeech();
    else { const latest = [...messages].reverse().find((item) => item.role === 'eno' && !item.review); if (latest) speak(latest.text); }
  }

  onMount(() => {
    disposed = false;
    pacing.enoShown();
    const media = matchMedia('(prefers-color-scheme: dark)');
    systemDark = media.matches;
    reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
    try { const saved = localStorage.getItem('dashboard-theme'); if (saved === 'light' || saved === 'dark' || saved === 'system') theme = saved; } catch { /* Use the system theme. */ }
    attemptKey = crypto.randomUUID();
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
      if (draft && SIGNUP_FIELDS.every((key) => typeof draft.answers?.[key] === 'string') && accountChoiceSchema.safeParse(draft.accountChoice).success && Array.isArray(draft.messages) && draft.messages.every((entry: Message) => ['eno', 'you'].includes(entry.role) && typeof entry.text === 'string' && typeof entry.id === 'number')) {
        pendingAddress = draft.pendingAddress;
        answers = draft.answers; accountChoice = draft.accountChoice; messages = draft.messages.slice(-40);
        nextId = Math.max(1, ...messages.map((entry) => entry.id));
        spending = spendingPreferencesSchema.safeParse(draft.spending).success ? draft.spending : emptySpending();
        includeCreditCard = typeof draft.includeCreditCard === 'boolean' ? draft.includeCreditCard : null;
        latestChoiceId = typeof draft.latestChoiceId === 'number' ? draft.latestChoiceId : 0;
        currentStage = ['details', 'spending', 'accounts', 'review'].includes(draft.currentStage) ? draft.currentStage : 'details';
        readyToCreate = draft.readyToCreate === true && spendingComplete(spending) && includeCreditCard !== null;
        latestReviewId = typeof draft.latestReviewId === 'number' ? draft.latestReviewId : 0;
        reviewFingerprint = draft.reviewFingerprint || '';
        attemptKey = typeof draft.attemptKey === 'string' ? draft.attemptKey : attemptKey;
        recovery = draft.recovery === true;
        createdCustomerId = typeof draft.createdCustomerId === 'string' ? draft.createdCustomerId : '';
        if (currentStage === 'details') { latestChoiceId = 0; latestReviewId = 0; readyToCreate = false; }
      }
    } catch { /* A new conversation still works without storage. */ }
    const onTheme = (event: MediaQueryListEvent) => { systemDark = event.matches; };
    media.addEventListener('change', onTheme);
    ready = true;
    void settle();
    return () => { disposed = true; pacing.dispose(); turnController?.abort(); stopSpeech(); media.removeEventListener('change', onTheme); };
  });

  $effect(() => {
    if (!ready || completed) return;
    try { sessionStorage.setItem(draftKey, JSON.stringify({ answers, accountChoice, spending, includeCreditCard, currentStage, latestChoiceId, messages, pendingAddress, readyToCreate, latestReviewId, reviewFingerprint, attemptKey, recovery, createdCustomerId })); } catch { /* Keep the current conversation in memory. */ }
  });

  function toggleTheme() { theme = isDark ? 'light' : 'dark'; try { localStorage.setItem('dashboard-theme', theme); } catch { /* Keep this visit’s choice. */ } }

  async function addEno(text: string, extra: Partial<Message> = {}, read = true) {
    return await pacing.reply(() => {
      const message = { id: ++nextId, role: 'eno' as const, text, ...extra };
      messages.push(message);
      if (voiceEnabled && read) speak(text, false);
      void settle();
      return message.id;
    }) ?? 0;
  }

  async function send(event: SubmitEvent) { event.preventDefault(); const text = reply.trim(); if (!text || busy || !ready || recovery) return; reply = ''; await sendText(text); }

  async function sendText(text: string, selectedAddress?: MailingAddress, choices: ChoiceInput = {}) {
    if (busy || recovery || createdCustomerId) return;
    stopSpeech();
    pacing.userSent();
    const activeChoice = messages.find((message) => message.id === latestChoiceId && message.choices);
    if (!selectedAddress && !choices.selectedSpending && !choices.selectedAccounts && activeChoice && isAffirmative(text)) {
      const selected = choicesFor(activeChoice);
      if (selected) choices = selected;
      else {
        messages.push({ id: ++nextId, role: 'you', text });
        waiting = true;
        try { await addEno('Pick at least one spending category first. “A bit of everything” works if you don’t have a favorite. Then you can just say yes.'); }
        finally { waiting = false; void settle(); }
        return;
      }
    }
    const history = messages.slice(-32).map(({ role, text }) => ({ role, text }));
    messages.push({ id: ++nextId, role: 'you', text });
    const review = messages.find((message) => message.id === latestReviewId && message.review);
    const reviewMatches = review?.review && profileFingerprint(review.review, review.accountChoice ?? accountChoice, review.spending ?? spending, review.includeCreditCard ?? includeCreditCard) === profileFingerprint(answers, accountChoice, spending, includeCreditCard);
    if (!selectedAddress && !choices.selectedSpending && !choices.selectedAccounts && readyToCreate && reviewMatches && isAffirmative(text)) {
      await submit();
      return;
    }
    await requestTurn(text, history, selectedAddress, choices);
  }

  async function retryTurn(text: string, selectedAddress?: MailingAddress, choices: ChoiceInput = {}) {
    if (busy) return;
    pacing.userSent();
    stopSpeech();
    const index = messages.findLastIndex((item) => item.role === 'you' && item.text === text);
    const history = messages.slice(0, index).slice(-32).map(({ role, text }) => ({ role, text }));
    await requestTurn(text, history, selectedAddress, choices);
  }

  function selectAddress(candidate: AddressCandidate) {
    reply = '';
    void sendText(`My mailing address is ${candidate.label}.`, candidate.address);
  }

  async function requestTurn(text: string, history: { role: 'eno' | 'you'; text: string }[], selectedAddress?: MailingAddress, choices: ChoiceInput = {}) {
    waiting = true;
    void settle();
    turnController = new AbortController();
    const timeout = setTimeout(() => turnController?.abort(), 40_000);
    try {
      const response = await fetch('/api/signup/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: turnController.signal,
        body: JSON.stringify({ message: text, answers, accountChoice, spending, includeCreditCard, history, pendingAddress, ...choices, reviewedFingerprint: latestReviewId ? reviewFingerprint : undefined, ...(selectedAddress ? { selectedAddress } : {}) })
      });
      const result = await response.json() as ConversationReply & { error?: string };
      if (!response.ok || !result.answers || !accountChoiceSchema.safeParse(result.accountChoice).success || !spendingPreferencesSchema.safeParse(result.spending).success) throw new Error(result.error || 'I lost my train of thought. Your details are still here — let’s try that message again.');
      if (disposed) return;
      answers = result.answers; accountChoice = result.accountChoice; spending = result.spending; includeCreditCard = result.includeCreditCard;
      const detailsAccepted = result.addressCheck?.status === 'matched' && customerCreateSchema.safeParse(customerFromAnswers(answers)).success && !asksToConfirmAddress(result.message);
      currentStage = detailsAccepted ? result.stage ?? (result.ready ? 'review' : 'details') : 'details';
      readyToCreate = result.ready && currentStage === 'review';
      if (currentStage !== 'review') { latestReviewId = 0; reviewFingerprint = ''; }
      pendingAddress = result.addressCheck?.status === 'correction' && result.addressCheck.candidates?.length === 1 ? result.addressCheck.candidates[0].address : result.addressCheck?.status === 'matched' && asksToConfirmAddress(result.message) ? result.addressCheck.address : undefined;
      const choiceStep = currentStage === 'spending' || currentStage === 'accounts' ? currentStage : undefined;
      const messageId = await addEno(result.message, { addressCheck: result.addressCheck, ...(choiceStep ? { choices: choiceStep, selectedCategories: [...spending.categories], selection: { checking: accountChoice === 'undecided' || accountChoice === 'both' || accountChoice === 'checking', savings: accountChoice === 'undecided' || accountChoice === 'both' || accountChoice === 'savings', creditCard: includeCreditCard !== false }, recommendedCard: result.recommendedCard ?? recommendDemoCard(spending) } : {}) });
      if (disposed) return;
      latestChoiceId = choiceStep ? messageId : 0;
      const fingerprint = profileFingerprint(answers, accountChoice, spending, includeCreditCard);
      if (readyToCreate && !result.confirmed && fingerprint !== reviewFingerprint) {
        latestReviewId = await addEno('Your profile, at a glance. Take a look before we make it official.', { review: { ...answers }, accountChoice, spending: { ...spending, categories: [...spending.categories] }, includeCreditCard, card: includeCreditCard === false ? null : result.card ?? recommendDemoCard(spending), addressCheck: result.addressCheck }, false);
        if (disposed) return;
        reviewFingerprint = fingerprint;
      }
      waiting = false;
      if (result.confirmed && readyToCreate) await submit();
    } catch (cause) {
      if (!disposed) await addEno(cause instanceof Error && cause.name !== 'AbortError' ? cause.message : 'That reply took a little longer than expected. Your details are still here — want to try again?', { retry: 'turn', retryText: text, selectedAddress, retryChoices: choices });
    } finally { clearTimeout(timeout); waiting = false; void settle(); }
  }

  function choicesFor(message: Message): ChoiceInput | null {
    if (message.choices === 'spending' && message.selectedCategories?.length) return { selectedSpending: [...message.selectedCategories] };
    if (message.choices === 'accounts' && message.selection) return { selectedAccounts: { ...message.selection } };
    return null;
  }

  function continueChoices(message: Message) {
    const choices = choicesFor(message);
    if (choices?.selectedSpending) {
      void sendText(`My top spending categories are ${choices.selectedSpending.map((category) => categoryLabels[category]).join(', ')}.`, undefined, choices);
    } else if (choices?.selectedAccounts && message.selection) {
      const selected = [message.selection.checking ? products.checking.name : '', message.selection.savings ? products.savings.name : '', message.selection.creditCard ? `${brandedCardName(message.recommendedCard)} credit card` : ''].filter(Boolean);
      void sendText(selected.length ? `I'd like ${selected.join(', ')}.` : 'No accounts yet, please.', undefined, choices);
    }
  }

  function edit(label: string) { void sendText(`I’d like to change my ${label.toLowerCase()}.`); }

  async function confirm() {
    if (busy || recovery || !readyToCreate) return;
    pacing.userSent();
    stopSpeech();
    messages.push({ id: ++nextId, role: 'you', text: 'Looks good. Let’s go.' });
    await submit();
  }

  async function submit() {
    submitting = true;
    await addEno(accountChoice === 'none' && !matchingCard ? `You got it, ${answers.first_name}. I’m getting your space ready.` : `You got it, ${answers.first_name}. I’m setting up your demo accounts with 100 sample transactions each. This may take a moment.`);
    if (disposed) return;
    void settle();
    try {
      if (!createdCustomerId) {
        const response = await fetch('/api/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': attemptKey }, body: JSON.stringify({ ...customerFromAnswers(answers), accountChoice, spending, includeCreditCard }) });
        const result = await response.json() as { customerId?: string; error?: string; created?: boolean; accountError?: string; addressCheck?: AddressCheck };
        if (!response.ok && result.addressCheck) {
          currentStage = 'details'; latestChoiceId = 0; latestReviewId = 0;
          pendingAddress = result.addressCheck.status === 'correction' && result.addressCheck.candidates?.length === 1 ? result.addressCheck.candidates[0].address : undefined;
          readyToCreate = result.addressCheck.status === 'unavailable';
          reviewFingerprint = '';
          await addEno(result.error || result.addressCheck.message, { addressCheck: result.addressCheck, ...(readyToCreate ? { retry: 'signup' as const } : {}) });
          return;
        }
        if (result.created && !result.customerId) { recovery = true; await addEno(result.error || 'Your profile was created, but I couldn’t open it yet. Head back to Sign in and choose your name.', { recovery: true }); return; }
        if (!response.ok || !result.customerId) { await addEno(result.error || 'That hit a little bump. Your details are still here. Want to try again?', { retry: 'signup' }); return; }
        createdCustomerId = result.customerId;
        if (result.accountError) { await addEno(result.accountError, { dashboard: `/dashboard?customer=${encodeURIComponent(createdCustomerId)}` }); return; }
      }
      completed = true;
      try { sessionStorage.removeItem(draftKey); } catch { /* The profile is saved in Nessie. */ }
      await goto(`/dashboard?customer=${encodeURIComponent(createdCustomerId)}`);
    } catch {
      completed = false;
      if (createdCustomerId) await addEno('Your profile is ready. Let’s try opening your dashboard again.', { retry: 'signup' });
      else { recovery = true; await addEno('I couldn’t confirm whether your profile was created. Head back to Sign in and check for your name before starting again.', { recovery: true }); }
    } finally { submitting = false; void settle(); }
  }
</script>

{#snippet arrow()}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>{/snippet}
{#snippet speaker()}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m11 5-6 4H2v6h3l6 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>{/snippet}

<div class="signup-chat" data-theme={theme}>
  <header>
    <a class="brand" href="/" aria-label="Capital One home"><CapitalOneLogo label="Capital One" /></a>
    <div class="header-actions">
      <button class="voice-toggle" disabled={!ready || !speechSupported} aria-label={voiceEnabled ? 'Mute Eno voice' : 'Enable Eno voice'} aria-pressed={voiceEnabled} onclick={toggleVoice}>{@render speaker()}<span>{speechSupported ? voiceEnabled ? 'Voice on' : 'Hear Eno speak' : 'Voice unavailable'}</span></button>
      <button class="theme-toggle" disabled={!ready} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={isDark} onclick={toggleTheme}>{#if isDark}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></svg>{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" /></svg>{/if}</button>
    <a class="exit" href="/" aria-label="Back to home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></a>
    </div>
  </header>
  <div class="experience">
  <main>
    <h1 class="sr-only">Sign up with Eno</h1>
    {#if speechNotice}<p class="speech-notice" role="status">{speechNotice}</p>{/if}
    <div class="transcript" bind:this={scrollArea} role="log" aria-label="Your conversation with Eno" aria-live="polite" aria-relevant="additions">
      <div class="messages">
        {#each messages as message (message.id)}
          <div class="message" class:from-you={message.role === 'you'}>
            {#if message.role === 'eno'}<span class="message-avatar"><Eno variant={isDark ? 'dark' : 'light'} size={40} alt="Eno" /></span>{/if}
            <div class="message-content">
              <span class="sender">{message.role === 'eno' ? 'Eno' : 'You'}{#if message.role === 'eno' && speechSupported}<button class="read-aloud" aria-label="Read Eno message aloud" title="Read aloud" onclick={() => speak(message.text)}>{@render speaker()}</button>{/if}</span>
              <div class="bubble"><p>{message.text}</p>
                {#if message.addressCheck?.status === 'correction'}
                  <div class="address-choices">{#each message.addressCheck.candidates ?? [] as candidate}<button disabled={busy || recovery || !!createdCustomerId} onclick={() => selectAddress(candidate)}>{candidate.label}</button>{/each}</div>
                {/if}
                {#if message.choices && message.id === latestChoiceId && currentStage === message.choices}
                  <SignupChoices step={message.choices} bind:categories={message.selectedCategories} bind:selection={message.selection} card={message.recommendedCard} disabled={busy || message.id !== latestChoiceId || recovery || !!createdCustomerId} oncontinue={() => continueChoices(message)} />
                {/if}
                {#if message.review && currentStage === 'review' && message.id === latestReviewId}
                  {#if message.addressCheck?.status === 'matched'}<p class="address-matched">✓ Street address matched · apartment/unit not verified</p>{/if}
                  <div class="profile-preview" aria-label="Your profile">
                    {#each [{ label: 'First name', value: message.review.first_name }, { label: 'Last name', value: message.review.last_name }, { label: 'Street address', value: `${message.review.street_number} ${message.review.street_name}` }, { label: 'City', value: message.review.city }, { label: 'State', value: message.review.state }, { label: 'ZIP', value: message.review.zip }] as row}
                      <div><span>{row.label}</span><strong>{row.value}</strong>{#if message.id === latestReviewId && readyToCreate && !createdCustomerId && !recovery}<button disabled={busy} onclick={() => edit(row.label)} aria-label={`Edit ${row.label.toLowerCase()}`}>Edit</button>{/if}</div>
                    {/each}
                    <div><span>Accounts</span><strong>{message.accountChoice === 'none' ? message.card ? 'No checking or savings' : 'None yet — a fresh dashboard' : accountTypesFor(message.accountChoice ?? 'none').map((type) => accountProduct(type, '')?.name ?? type).join(' + ') + ' · 100 sample transactions each'}</strong>{#if message.id === latestReviewId && !createdCustomerId && !recovery}<button disabled={busy} onclick={() => edit('account choice')} aria-label="Edit account choice">Edit</button>{/if}</div>
                    <div><span>Spending</span><strong>{message.spending?.status === 'skip' ? 'No category preference' : message.spending?.categories.map((category) => categoryLabels[category]).join(' · ')}</strong>{#if message.id === latestReviewId && !createdCustomerId && !recovery}<button disabled={busy} onclick={() => edit('spending priorities and demo credit card')} aria-label="Edit spending priorities">Edit</button>{/if}</div>
                  </div>
                  {#if message.card}<div class="card-match" style:--product-gradient={products[message.card.id].gradient} style:--product-ink={products[message.card.id].ink}><span class="card-demo-label">YOUR MATCH · DEMO CREDIT CARD</span><strong>{brandedCardName(message.card)}</strong><p>{message.card.reason}</p><small>100 fictional transactions · balance owed = purchases − payments · 1 demo point per $1 spent</small></div>{/if}
                  {#if message.id === latestReviewId && readyToCreate && !recovery}<button class="confirm" disabled={busy} onclick={confirm}>Looks good. Let’s go {@render arrow()}</button>{/if}
                {/if}
                {#if message.retry && !recovery}<button class="confirm" disabled={busy} onclick={() => message.retry === 'turn' ? retryTurn(message.retryText || '', message.selectedAddress, message.retryChoices) : confirm()}>Try again {@render arrow()}</button>{/if}
                {#if message.recovery}<a class="confirm" href="/">Go to Sign in {@render arrow()}</a>{/if}
                {#if message.dashboard}<a class="confirm" href={message.dashboard}>Open my dashboard {@render arrow()}</a>{/if}
              </div>
            </div>
          </div>
        {/each}
        {#if busy}<div class="message typing" role="status" aria-label={submitting ? 'Eno is creating your profile' : 'Eno is typing'}><span class="message-avatar"><EnoThinking active={busy} variant={isDark ? 'dark' : 'light'} size={40} /></span><div><span class="sender">Eno</span><span class="typing-dots"><i></i><i></i><i></i></span></div></div>{/if}
      </div>
    </div>
    <div class="composer-area">
      <form class="composer" onsubmit={send}>
        <AddressAutocomplete bind:this={autocomplete} query={reply} context={{ city: answers.city, state: answers.state, zip: answers.zip }} disabled={!ready || busy || recovery || !!createdCustomerId} bind:open={suggestionsOpen} bind:activeId={activeAddressId} onselect={selectAddress} />
        <input bind:this={input} bind:value={reply} aria-label="Message Eno" role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls={suggestionsOpen ? 'address-suggestions' : undefined} aria-activedescendant={activeAddressId} onkeydown={(event) => autocomplete?.handleKeydown(event)} placeholder={recovery ? 'Find your profile through Sign in' : 'Message Eno…'} disabled={!ready || submitting || recovery || !!createdCustomerId} maxlength="2000" autocomplete="off" />
        <button class="send" type="submit" aria-label="Send message" disabled={!ready || busy || !reply.trim() || recovery}>{@render arrow()}</button>
      </form>
    </div>
  </main>
  </div>
</div>

<style>
  :global(body:has(.signup-chat)) { margin: 0; }
  :global(html:has(.signup-chat)) { overflow: hidden; }
  .signup-chat { --dark: ; --light: initial; --page: var(--dark, #171717) var(--light, #f4f6f8); --surface: var(--dark, #242424) var(--light, #fff); --ink: var(--dark, #f2f2f2) var(--light, #142632); --muted: var(--dark, #bdbdbd) var(--light, #50636e); --border: var(--dark, #414141) var(--light, #dae3e8); --link: var(--dark, #9fdbf0) var(--light, #075e80); --button: var(--dark, #e5e5e5) var(--light, #123f56); --button-text: var(--dark, #202020) var(--light, #fff); --glow: var(--dark, #393939) var(--light, #c6e5fc); --reply: var(--dark, #333333) var(--light, #dfeef6); height: 100dvh; display: flex; flex-direction: column; color: var(--ink); background: radial-gradient(ellipse 70% 80% at 50% 100%, color-mix(in srgb, var(--glow) 40%, transparent), transparent 100%), var(--page); color-scheme: var(--dark, dark) var(--light, light); font: 15px/1.65 Inter, system-ui, sans-serif; }
  .signup-chat[data-theme='dark'] { --dark: initial; --light: ; }
  @media (prefers-color-scheme: dark) { .signup-chat[data-theme='system'] { --dark: initial; --light: ; } }
  .signup-chat * { box-sizing: border-box; }
  button, input { font: inherit; color: inherit; }
  button { cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  button, a { -webkit-tap-highlight-color: transparent; }
  a { color: inherit; text-decoration: none; }
  :is(button, a):focus-visible { outline: 2px solid var(--link); outline-offset: 4px; }
  svg { width: 20px; height: 20px; flex: none; }
  header {
    --surface: var(--dark, #18252d) var(--light, #fff);
    --border: var(--dark, #31444f) var(--light, #dae3e8);
    --ink: var(--dark, #ecf3f6) var(--light, #142632);
    --muted: var(--dark, #b1c3cc) var(--light, #50636e);
    color: var(--ink);
    width: min(1200px, calc(100% - 72px)); display: flex; align-items: center; justify-content: space-between; margin: 0 auto; padding: 24px 0; flex: none; }
  .brand { display: flex; align-items: center; gap: 16px; color: var(--dark, #fff) var(--light, #013d5b); }
  .brand :global(svg) { width: 110px; height: 40px; }
  .exit { display: grid; place-items: center; border: 1px solid var(--border); border-radius: 50%; width: 38px; height: 38px; color: var(--muted); }
  .exit:hover { background: var(--surface); }
  .experience { display: flex; flex: 1; min-height: 0; width: min(800px, 100%); margin: 0 auto; }
  .header-actions { display: flex; align-items: center; gap: 16px; }
  .voice-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 13px; border: 1px solid var(--border); border-radius: 24px; background: var(--surface); font-size: 11px; }
  .voice-toggle[aria-pressed='true'] { border-color: var(--link); color: var(--link); }
  .voice-toggle svg { width: 16px; height: 16px; }
  .speech-notice { margin: 0 22px 12px; color: var(--muted); font-size: 11px; text-align: center; }
  .read-aloud { display: grid; place-items: center; padding: 1px; border: 0; background: transparent; color: var(--muted); }
  .read-aloud:hover { color: var(--link); }.read-aloud svg { width: 13px; height: 13px; }
  main { display: flex; flex-direction: column; min-height: 0; min-width: 0; width: 100%; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .transcript { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .messages { display: flex; flex-direction: column; gap: 28px; padding: 30px 22px 36px; }
  .message { display: flex; align-items: flex-start; gap: 12px; max-width: 92%; }
  .message-avatar { display: block; flex: none; width: 40px; height: 40px; margin-top: 24px; }
  .sender { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 11px; margin: 0 0 7px 2px; }
  .bubble { padding: 17px 20px; border: 1px solid var(--border); border-radius: 4px 20px 20px; background: var(--surface); }
  .bubble > p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .message-content { min-width: 0; }
  .from-you { align-self: flex-end; max-width: 80%; }
  .from-you .sender { justify-content: flex-end; margin-right: 3px; }
  .from-you .bubble { border-color: transparent; border-radius: 20px 4px 20px 20px; background: var(--reply); padding-block: 12px; }
  .card-match { display: grid; gap: 8px; margin-top: 18px; padding: 18px; border-radius: 14px; color: var(--product-ink); background: var(--product-gradient); }
  .card-demo-label { font-size: 9px; letter-spacing: .1em; }.card-match > strong { font-size: 23px; font-weight: 600; }.card-match > p { margin: 0; font-size: 12px; }.card-match > small { font-size: 10px; }
  .address-matched { margin: 14px 0 0; color: var(--link); font-size: 11px; }
  .address-choices { display: grid; gap: 8px; margin-top: 14px; }
  .address-choices button { text-align: left; padding: 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--reply); font-size: 12px; }
  .profile-preview { margin-top: 20px; border-top: 1px solid var(--border); }
  .profile-preview > div { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 11px 0; border-bottom: 1px solid var(--border); }
  .profile-preview > div > span { width: 72px; flex: none; font-size: 11px; color: var(--muted); }
  .profile-preview strong { min-width: 90px; flex: 1; font-size: 13px; font-weight: 550; overflow-wrap: anywhere; }
  .profile-preview button { padding: 2px 0; border: 0; background: transparent; color: var(--link); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
  .confirm { display: inline-flex; align-items: center; gap: 12px; margin-top: 18px; padding: 9px 14px; border: 0; border-radius: 8px; color: var(--button-text); background: var(--button); font-size: 12px; font-weight: 600; }
  .confirm svg { width: 16px; height: 16px; }
  .typing-dots { display: inline-flex; gap: 4px; align-items: center; padding: 15px 18px; border: 1px solid var(--border); border-radius: 4px 16px 16px; background: var(--surface); }
  .typing-dots i { display: block; width: 5px; height: 5px; border-radius: 50%; background: var(--muted); animation: pulse 1s ease-in-out infinite; }
  .typing-dots i:nth-child(2) { animation-delay: 150ms; }.typing-dots i:nth-child(3) { animation-delay: 300ms; }
  @keyframes pulse { 50% { opacity: .3; transform: translateY(-2px); } }
  .composer-area { flex: none; padding: 12px 22px max(18px, env(safe-area-inset-bottom)); }
  .composer { position: relative; display: flex; align-items: center; gap: 10px; padding: 8px; border: 1px solid var(--border); border-radius: 30px; background: var(--surface); box-shadow: 0 8px 24px #102b4212; }
  .composer input { flex: 1; min-width: 0; padding: 9px 6px 9px 14px; border: 0; background: transparent; outline: 0; font-size: 15px; }
  .composer input::placeholder { color: var(--muted); }
  .send { display: grid; place-items: center; flex: none; width: 40px; height: 40px; padding: 0; border: 0; border-radius: 50%; background: var(--button); color: var(--button-text); }
  .theme-toggle { display: grid; place-items: center; flex: none; width: 38px; height: 38px; padding: 0; border: 1px solid var(--border); border-radius: 50%; background: transparent; }
  .theme-toggle svg { width: 18px; height: 18px; }
  @media (max-width: 600px) {
    .voice-toggle { width: 38px; height: 38px; padding: 0; flex: none; }.voice-toggle span { display: none; }
    .header-actions { gap: 10px; }
    main { flex: 1; }
    header {
    --surface: var(--dark, #18252d) var(--light, #fff);
    --border: var(--dark, #31444f) var(--light, #dae3e8);
    --ink: var(--dark, #ecf3f6) var(--light, #142632);
    --muted: var(--dark, #b1c3cc) var(--light, #50636e);
    color: var(--ink);
    width: calc(100% - 36px); padding: 18px 0; }
    .brand { gap: 10px; }.brand :global(svg) { width: 94px; height: 34px; }
    .messages { padding: 18px 16px 28px; gap: 22px; }.message { max-width: 96%; gap: 8px; }
    .bubble { padding: 14px; font-size: 14px; }.from-you { max-width: 85%; }
    .composer-area { padding-inline: 14px; }.composer input { font-size: 16px; padding-left: 10px; }
    .profile-preview > div > span { width: 55px; }.profile-preview strong { min-width: 70px; }
  }
  @media (prefers-reduced-motion: reduce) { .typing-dots i { animation: none; } }
</style>
