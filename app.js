(function () {
  'use strict';

  const CONFIG = window.SEIJO_CONFIG;
  if (!CONFIG) throw new Error('サイト設定を読み込めませんでした。');

  const state = {
    idToken: '',
    selectedCandidateId: '',
    votingEnabled: false,
    submitting: false,
    completion: null,
    progress: null,
    systemMode: 'story',
    candidates: CONFIG.candidates,
    toastTimer: null,
  };

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function setStatus(message, { loading = false, error = false } = {}) {
    $('statusText').textContent = message;
    $('statusSpinner').classList.toggle('hidden', !loading);
    $('statusBox').classList.toggle('error', error);
    $('retryButton').classList.toggle('hidden', !error);
  }

  function showToast(message, duration = 2400) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove('visible'), duration);
  }

  function imageUrl(path) {
    const separator = path.includes('?') ? '&' : '?';
    return `${path}${separator}v=${encodeURIComponent(CONFIG.app.assetVersion)}`;
  }

  function safeCandidate(candidateId) {
    return state.candidates.find(candidate => candidate.id === String(candidateId || '')) ||
      CONFIG.candidates.find(candidate => candidate.id === String(candidateId || '')) || null;
  }

  function mergedCandidates(serverCandidates) {
    if (!Array.isArray(serverCandidates)) return CONFIG.candidates;
    return serverCandidates.map(serverCandidate => {
      const local = CONFIG.candidates.find(candidate => candidate.id === String(serverCandidate.id)) || {};
      return Object.freeze({ ...local, ...serverCandidate, id: String(serverCandidate.id) });
    }).filter(candidate => CONFIG.candidates.some(local => local.id === candidate.id));
  }

  function safePhotoKey(candidateId, photoKey) {
    const candidate = safeCandidate(candidateId);
    if (!candidate) return '01_1';
    const match = String(photoKey || '').match(/^(0[1-5])_([1-3])$/);
    if (!match || match[1] !== candidate.id) return `${candidate.id}_1`;
    const number = Number(match[2]);
    return number >= 1 && number <= Number(candidate.photoCount || 3)
      ? `${candidate.id}_${number}`
      : `${candidate.id}_1`;
  }

  function rewardConfig(keyOrThreshold) {
    return CONFIG.rewards.find(reward =>
      reward.key === keyOrThreshold || reward.threshold === Number(keyOrThreshold)
    ) || null;
  }

  function fileExtensionFromUrl(url) {
    const path = String(url || '').split(/[?#]/, 1)[0];
    const match = path.match(/\.([a-z0-9]+)$/i);
    return match ? `.${match[1].toLowerCase()}` : '';
  }

  function resolvedRewardAsset(reward, fallbackCandidateId = '') {
    const asset = reward?.asset || {};
    const candidateId = String(reward?.candidateId || fallbackCandidateId || '');
    const candidate = safeCandidate(candidateId);
    const url = asset.byCandidate?.[candidateId] || asset.url || '';
    const extension = asset.type === 'image' ? (fileExtensionFromUrl(url) || '.jpeg') : '';
    return {
      ...asset,
      available: Boolean(asset.available && url),
      url,
      candidateId,
      candidateName: reward?.candidateName || candidate?.name || '',
      downloadName: candidateId && asset.downloadName
        ? `${asset.downloadName}-${candidateId}${extension}`
        : asset.downloadName,
    };
  }

  function buildShareText(candidateName) {
    return `成城ミスコン2026「Story」で${candidateName}さんを応援中！\n` +
      `今日の一票が、次のChapterにつながります。\n#成城ミスコン2026 #SeijoStory`;
  }

  function normaliseProgress(payload = {}) {
    const completion = payload.completion || {};
    const source = payload.progress || completion.progress || completion;
    const rawCount = source.cumulativeCount;
    const hasCumulative = rawCount !== '' && rawCount !== null && rawCount !== undefined &&
      Number.isFinite(Number(rawCount));
    const cumulativeCount = hasCumulative
      ? clamp(Number(rawCount), 0, CONFIG.period.maxVotes)
      : null;
    const streakCount = Math.max(0, Number(source.streakCount ?? completion.streakCount) || 0);
    const longestStreak = Math.max(streakCount, Number(source.longestStreak) || 0);
    const backendStates = Array.isArray(source.rewardStates) ? source.rewardStates : [];

    const rewardStates = CONFIG.rewards.map(reward => {
      const backend = backendStates.find(item =>
        item.key === reward.key || Number(item.threshold) === reward.threshold
      );
      const earned = backend
        ? Boolean(backend.earned)
        : (cumulativeCount !== null && cumulativeCount >= reward.threshold);
      return {
        ...reward,
        earned,
        earnedAt: backend?.earnedAt || '',
        candidateId: backend?.candidateId ? String(backend.candidateId) : '',
        candidateName: backend?.candidateName || '',
      };
    });

    const nextRewardConfig = rewardStates.find(reward => !reward.earned) || null;
    const backendNext = source.nextReward || null;
    const nextReward = nextRewardConfig ? {
      ...nextRewardConfig,
      remaining: cumulativeCount === null
        ? nextRewardConfig.threshold
        : Math.max(0, Number(backendNext?.remaining) || nextRewardConfig.threshold - cumulativeCount),
    } : null;

    return {
      cumulativeCount,
      maxCount: Number(source.maxCount) || CONFIG.period.maxVotes,
      streakCount,
      longestStreak,
      rewardStates,
      earnedRewards: rewardStates.filter(reward => reward.earned).map(reward => reward.key),
      nextReward,
      perfectAttendance: Boolean(source.perfectAttendance || completion.perfectAttendance),
    };
  }

  function renderProgress(progress) {
    state.progress = progress;
    $('progressPanel').classList.remove('hidden');

    if (progress.cumulativeCount === null) {
      $('cumulativeCount').textContent = '—';
      $('progressBar').style.width = '0%';
      $('currentStreak').textContent = progress.streakCount ? `${progress.streakCount}日` : '確認中';
      $('nextChapterText').textContent = '9月1日から累計投票が始まります';
    } else {
      $('cumulativeCount').textContent = String(progress.cumulativeCount);
      $('progressBar').style.width = `${(progress.cumulativeCount / CONFIG.period.maxVotes) * 100}%`;
      $('currentStreak').textContent = `${progress.streakCount}日`;
      $('nextChapterText').textContent = progress.nextReward
        ? `${progress.nextReward.title}まであと${progress.nextReward.remaining}回`
        : 'すべてのChapterを達成しました';
    }

    renderRewardTimeline($('rewardTimeline'), progress);
  }

  function renderRewardTimeline(container, progress) {
    container.replaceChildren();
    const states = progress?.rewardStates || CONFIG.rewards.map(reward => ({ ...reward, earned: false }));

    states.forEach(reward => {
      const asset = resolvedRewardAsset(reward);
      const item = document.createElement('article');
      item.className = `reward-item${reward.earned ? ' earned' : ''}`;

      const medallion = document.createElement('div');
      medallion.className = 'reward-medallion';
      medallion.textContent = reward.earned ? '✓' : String(reward.threshold);
      medallion.setAttribute('aria-label', reward.earned ? `${reward.threshold}回特典獲得済み` : `${reward.threshold}回で獲得`);

      const copy = document.createElement('div');
      copy.className = 'reward-copy';

      const chapter = document.createElement('div');
      chapter.className = 'reward-chapter';
      chapter.textContent = reward.chapter;

      const titleRow = document.createElement('div');
      titleRow.className = 'reward-title-row';
      const title = document.createElement('h4');
      title.textContent = reward.title;
      const badge = document.createElement('span');
      badge.className = 'reward-badge';
      if (reward.earned) {
        badge.textContent = asset.available ? '獲得済み' : '獲得済み・準備中';
      } else if (progress?.cumulativeCount === null) {
        badge.textContent = `${reward.threshold}回で解放`;
      } else {
        badge.textContent = `あと${Math.max(0, reward.threshold - progress.cumulativeCount)}回`;
      }
      titleRow.append(title, badge);

      const description = document.createElement('p');
      description.textContent = reward.description;
      copy.append(chapter, titleRow, description);

      if (reward.earned && asset.candidateName) {
        const candidateLabel = document.createElement('p');
        candidateLabel.className = 'reward-candidate-label';
        candidateLabel.textContent = `${asset.candidateName}さんの特典`;
        copy.appendChild(candidateLabel);
      }

      if (reward.earned && asset.available) {
        const link = document.createElement('a');
        link.className = 'reward-asset-link';
        link.href = imageUrl(asset.url);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = asset.type === 'video'
          ? '動画を見る'
          : (reward.key === 'wallpaper' ? '壁紙を開く' : '画像を開いて保存');
        if (asset.downloadName && asset.type === 'image') {
          link.download = asset.downloadName;
        }
        copy.appendChild(link);
      }

      item.append(medallion, copy);
      container.appendChild(item);
    });
  }

  function createCandidateCard(candidate, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'candidate-card';
    button.dataset.id = candidate.id;
    button.disabled = !state.votingEnabled;
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-label', `${candidate.name}さんを選択`);

    const frame = document.createElement('div');
    frame.className = 'profile-frame';
    const profile = document.createElement('img');
    profile.src = imageUrl(`./assets/profile/${candidate.id}.jpeg`);
    profile.alt = `${candidate.name} 宣材写真`;
    profile.loading = index < 2 ? 'eager' : 'lazy';
    profile.decoding = 'async';
    profile.addEventListener('error', () => {
      profile.src = imageUrl('./assets/logo.jpeg');
      profile.alt = `${candidate.name} 画像を読み込めませんでした`;
    }, { once: true });
    frame.appendChild(profile);

    const info = document.createElement('div');
    info.className = 'candidate-info';
    const chapter = document.createElement('div');
    chapter.className = 'candidate-chapter';
    chapter.textContent = `FINALIST STORY ${String(index + 1).padStart(2, '0')}`;

    const name = document.createElement('div');
    name.className = 'candidate-name';
    name.textContent = candidate.name;
    const hint = document.createElement('div');
    hint.className = 'candidate-hint';
    hint.textContent = 'タップして、この物語を応援';
    info.append(chapter, name, hint);

    const mark = document.createElement('span');
    mark.className = 'selection-mark';
    mark.setAttribute('aria-hidden', 'true');

    button.append(frame, info, mark);
    button.addEventListener('click', () => selectCandidate(candidate.id));
    return button;
  }

  function renderCandidates(candidates = state.candidates) {
    const list = $('candidateList');
    list.replaceChildren();
    candidates.forEach((candidate, index) => list.appendChild(createCandidateCard(candidate, index)));
  }

  function setCandidateCardsDisabled(disabled) {
    document.querySelectorAll('.candidate-card').forEach(card => {
      card.disabled = disabled;
    });
  }

  function selectCandidate(candidateId) {
    if (!state.votingEnabled || state.submitting) return;
    state.selectedCandidateId = candidateId;

    document.querySelectorAll('.candidate-card').forEach(card => {
      const selected = card.dataset.id === candidateId;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-pressed', selected ? 'true' : 'false');
      const hint = card.querySelector('.candidate-hint');
      if (hint) hint.textContent = selected ? 'この方に投票します' : 'タップして、この物語を応援';
    });

    const candidate = safeCandidate(candidateId);
    $('submitButton').disabled = false;
    $('submitButton').textContent = `${candidate?.name || '選択した方'}さんに投票する`;
  }

  function jsonpOnce(action, params = {}, timeoutMs = CONFIG.app.requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      if (!CONFIG.app.apiUrl.startsWith('https://script.google.com/macros/s/')) {
        reject(new Error('投票システムの接続先が設定されていません。'));
        return;
      }

      const callbackName = `seijoStoryCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement('script');
      let settled = false;
      let timer;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
        script.remove();
      };

      timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('投票システムとの通信がタイムアウトしました。'));
      }, timeoutMs);

      window[callbackName] = payload => {
        cleanup();
        if (!payload || payload.ok === false) {
          reject(new Error(payload?.error || '投票システムから正しい応答を受け取れませんでした。'));
          return;
        }
        resolve(payload);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error('投票システムとの通信に失敗しました。'));
      };

      const query = new URLSearchParams({
        action,
        callback: callbackName,
        clientVersion: CONFIG.app.clientVersion,
        _: String(Date.now()),
        ...params,
      });
      script.src = `${CONFIG.app.apiUrl}?${query.toString()}`;
      document.body.appendChild(script);
    });
  }

  async function jsonp(action, params = {}, label = '通信') {
    let lastError = null;
    for (let attempt = 1; attempt <= CONFIG.app.maxRetries; attempt += 1) {
      try {
        if (attempt > 1) {
          setStatus(`${label}に時間がかかっています。\n自動で再試行しています（${attempt}/${CONFIG.app.maxRetries}）`, { loading: true });
        }
        return await jsonpOnce(action, params);
      } catch (error) {
        lastError = error;
        if (attempt < CONFIG.app.maxRetries) await sleep(1000 * attempt);
      }
    }
    throw lastError || new Error(`${label}に失敗しました。`);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {}
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }

  function formatVoteTime(value) {
    const stringValue = String(value || '').trim();
    return stringValue ? `投票日時：${stringValue.replace(/-/g, '/')}` : '投票日時を確認できませんでした';
  }

  function loadCompletionImage(src, alt) {
    const image = $('completionPhoto');
    const loader = $('photoLoader');
    image.classList.remove('loaded');
    loader.classList.remove('hidden');
    loader.textContent = 'メッセージを読み込んでいます…';
    image.alt = alt;

    image.onload = () => {
      loader.classList.add('hidden');
      image.classList.add('loaded');
    };
    image.onerror = () => {
      loader.textContent = '画像を読み込めませんでした。投票記録は正常に保存されています。';
      image.classList.remove('loaded');
    };
    image.src = imageUrl(src);
  }

  function showNewRewards(keys, progress, fallbackCandidateId = '') {
    const validRewards = (Array.isArray(keys) ? keys : [])
      .map(key => rewardConfig(key))
      .filter(Boolean);
    $('newRewardPanel').classList.toggle('hidden', validRewards.length === 0);
    $('newRewardList').replaceChildren();
    validRewards.forEach(reward => {
      const rewardState = progress?.rewardStates?.find(item => item.key === reward.key) || reward;
      const asset = resolvedRewardAsset(rewardState, fallbackCandidateId);

      if (['wallpaper', 'signed_image'].includes(reward.key) && asset.available) {
        const isWallpaper = reward.key === 'wallpaper';
        const unlock = document.createElement('section');
        unlock.className = 'image-reward-unlock';

        const chapter = document.createElement('p');
        chapter.className = 'image-reward-unlock-chapter';
        chapter.textContent = `${reward.chapter.toUpperCase()} COMPLETE`;

        const title = document.createElement('h4');
        title.textContent = `${asset.candidateName}さんの${reward.title}`;

        const message = document.createElement('p');
        message.className = 'image-reward-unlock-message';
        message.textContent = isWallpaper
          ? '15回目の投票で選んだファイナリストの壁紙を獲得しました。あなたのStoryに、この一枚を。'
          : '30回目の投票で選んだファイナリストのデジタルサイン入り画像を獲得しました。この一枚は、これからも変わらず保存できます。';

        const frame = document.createElement('div');
        frame.className = 'image-reward-unlock-frame';
        const image = document.createElement('img');
        image.className = 'image-reward-unlock-image';
        image.src = imageUrl(asset.url);
        image.alt = `${asset.candidateName}さんの${reward.threshold}回投票達成${reward.title}`;
        image.decoding = 'async';
        frame.appendChild(image);

        const link = document.createElement('a');
        link.className = 'image-reward-unlock-button';
        link.href = imageUrl(asset.url);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.download = asset.downloadName;
        link.textContent = isWallpaper ? '壁紙を開いて保存する' : 'サイン入り画像を開いて保存する';

        const note = document.createElement('p');
        note.className = 'image-reward-unlock-note';
        note.textContent = 'iPhoneでは画像を開き、長押しして「写真に保存」を選んでください。';

        unlock.append(chapter, title, message, frame, link, note);
        $('newRewardList').appendChild(unlock);
        return;
      }

      const chip = document.createElement('span');
      chip.className = 'new-reward-chip';
      chip.textContent = `${reward.threshold}回特典：${reward.title}`;
      $('newRewardList').appendChild(chip);
    });
  }

  function showCompletion(payload) {
    const data = payload?.completion || payload;
    const candidate = safeCandidate(data?.candidateId);
    if (!candidate) throw new Error('投票済み候補者の情報を確認できませんでした。');

    const progress = normaliseProgress(payload?.completion ? payload : { completion: data });
    const photoKey = safePhotoKey(candidate.id, data?.photoKey);
    const candidateIndex = state.candidates.findIndex(item => item.id === candidate.id);
    const shareText = buildShareText(candidate.name);

    state.progress = progress;
    state.completion = {
      candidateId: candidate.id,
      candidateName: candidate.name,
      photoKey,
      voteTimestamp: data?.voteTimestamp || '',
    };

    document.body.classList.add('completion-mode');
    $('votePanel').classList.add('hidden');
    $('completionView').classList.remove('hidden');
    $('completionFinalist').textContent = `FINALIST STORY ${String(candidateIndex + 1).padStart(2, '0')}`;
    $('completionName').textContent = candidate.name;
    $('shareText').textContent = shareText;
    $('voteTime').textContent = formatVoteTime(data?.voteTimestamp);

    if (progress.cumulativeCount !== null) {
      $('completionProgress').classList.remove('hidden');
      $('completionCumulative').textContent = `${progress.cumulativeCount} / ${CONFIG.period.maxVotes}回`;
      $('completionStreak').textContent = `${progress.streakCount}日`;
      $('completionNext').textContent = progress.nextReward
        ? `次のChapter「${progress.nextReward.title}」まであと${progress.nextReward.remaining}回`
        : 'あなたのStoryが完成しました。';
    } else {
      $('completionProgress').classList.add('hidden');
      $('completionNext').textContent = data?.streakCount
        ? `${Math.max(1, Number(data.streakCount) || 1)}日連続投票中。9月1日から新しいStoryが始まります。`
        : '明日もあなたの一票をお待ちしています。';
    }

    renderRewardTimeline($('completionRewardTimeline'), progress);
    showNewRewards(
      data?.newlyUnlockedRewards || payload?.newlyUnlockedRewards || [],
      progress,
      candidate.id
    );
    loadCompletionImage(
      `./assets/completion/${photoKey}.jpeg`,
      `${candidate.name}さんからの投票完了メッセージ`
    );
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  async function submitVote() {
    if (!state.selectedCandidateId || !state.votingEnabled || state.submitting) return;

    state.submitting = true;
    setCandidateCardsDisabled(true);
    $('submitButton').disabled = true;
    $('submitButton').textContent = '一票を物語に記しています…';
    setStatus('あなたの一票を送信しています…', { loading: true });

    try {
      const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const response = await jsonp('submit', {
        idToken: state.idToken,
        candidateId: state.selectedCandidateId,
        requestId,
        userAgent: navigator.userAgent,
      }, '投票送信');
      if (!response.completion) throw new Error('投票完了情報を取得できませんでした。');
      state.systemMode = response.systemMode || state.systemMode;
      showCompletion(response);
    } catch (error) {
      state.submitting = false;
      setCandidateCardsDisabled(false);
      $('submitButton').disabled = false;
      const candidate = safeCandidate(state.selectedCandidateId);
      $('submitButton').textContent = `${candidate?.name || '選択した方'}さんに投票する`;
      setStatus(`${error.message || '投票に失敗しました。'}\n時間をおいて、もう一度お試しください。`, { error: true });
    }
  }

  async function shareToInstagram() {
    if (!state.completion) return;
    const text = buildShareText(state.completion.candidateName);
    await copyText(text);
    if (navigator.share) {
      try {
        await navigator.share({ title: '成城ミスコン2026 Story', text, url: CONFIG.app.shareUrl });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          showToast('シェア文はコピー済みです');
          return;
        }
      }
    }
    showToast('シェア文をコピーしました。Instagramに貼り付けてください', 3200);
  }

  function enableVoting(candidates) {
    state.votingEnabled = true;
    state.candidates = candidates;
    renderCandidates(candidates);
    $('candidateList').classList.remove('hidden');
    $('voteAction').classList.remove('hidden');
    setStatus('応援したいファイナリストを1人選んでください。');
  }

  function previewResponse() {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('preview') || 'voting';
    const count = clamp(Number(params.get('count')) || 12, 0, CONFIG.period.maxVotes);
    const candidateId = params.get('candidate') || '01';
    const candidate = safeCandidate(candidateId);
    const streakCount = Math.min(count, Number(params.get('streak')) || Math.max(1, count));
    const rewardStates = CONFIG.rewards.map(reward => ({
      threshold: reward.threshold,
      key: reward.key,
      earned: count >= reward.threshold,
      earnedAt: count >= reward.threshold ? '2026-09-15 12:00:00' : '',
      candidateId: reward.asset?.byCandidate && count >= reward.threshold ? candidateId : '',
      candidateName: reward.asset?.byCandidate && count >= reward.threshold ? candidate?.name : '',
    }));
    const next = CONFIG.rewards.find(reward => count < reward.threshold) || null;
    const progress = {
      cumulativeCount: count,
      maxCount: CONFIG.period.maxVotes,
      streakCount,
      longestStreak: streakCount,
      rewardStates,
      nextReward: next ? { threshold: next.threshold, key: next.key, remaining: next.threshold - count } : null,
      perfectAttendance: count === CONFIG.period.maxVotes,
    };
    const response = {
      ok: true,
      systemMode: 'story',
      periodStatus: 'open',
      config: { candidates: CONFIG.candidates },
      progress,
      alreadyVoted: mode === 'completion',
    };
    if (mode === 'completion') {
      response.completion = {
        candidateId,
        candidateName: safeCandidate(candidateId)?.name,
        photoKey: `${candidateId}_1`,
        streakCount,
        cumulativeCount: count,
        voteTimestamp: '2026-09-01 21:00:00',
        newlyUnlockedRewards: CONFIG.rewards.filter(reward => reward.threshold === count).map(reward => reward.key),
      };
    }
    return response;
  }

  async function initialize() {
    const previewParams = new URLSearchParams(window.location.search);
    const isQaPreview = window.location.hostname === 'seijomisscon2026.github.io' &&
      previewParams.get('qa') === 'signed30-20260929-4d4ac1fe-9f7b2d81';
    const isLocalPreview = (['localhost', '127.0.0.1'].includes(window.location.hostname) || isQaPreview) &&
      previewParams.has('preview');
    if (isLocalPreview) {
      const response = previewResponse();
      state.systemMode = 'story';
      state.progress = normaliseProgress(response);
      renderProgress(state.progress);
      if (response.alreadyVoted) showCompletion(response);
      else enableVoting(CONFIG.candidates);
      return;
    }

    try {
      setStatus('LINE認証を確認しています…', { loading: true });
      if (!window.liff) throw new Error('LINE認証機能を読み込めませんでした。通信環境をご確認ください。');
      await window.liff.init({ liffId: CONFIG.app.liffId });

      if (!window.liff.isLoggedIn()) {
        window.liff.login({ redirectUri: window.location.href });
        return;
      }

      state.idToken = window.liff.getIDToken() || '';
      if (!state.idToken) {
        throw new Error('LINE認証情報を取得できませんでした。LINEアプリ内から開き直してください。');
      }

      setStatus('本日の投票状況を確認しています…', { loading: true });
      const response = await jsonp('status', { idToken: state.idToken }, '投票状況確認');
      state.systemMode = response.systemMode || 'legacy';
      state.candidates = mergedCandidates(response.config?.candidates);
      state.progress = normaliseProgress(response);
      renderProgress(state.progress);

      if (response.alreadyVoted && response.completion) {
        showCompletion(response);
        return;
      }

      if (response.periodStatus === 'before') {
        state.votingEnabled = false;
        renderCandidates(state.candidates);
        $('candidateList').classList.remove('hidden');
        setStatus('新しいStoryは2026年9月1日 0:00から始まります。');
        return;
      }

      if (response.periodStatus === 'ended') {
        state.votingEnabled = false;
        renderCandidates(state.candidates);
        $('candidateList').classList.remove('hidden');
        setStatus('投票期間は終了しました。たくさんの応援をありがとうございました。');
        return;
      }

      enableVoting(state.candidates);
    } catch (error) {
      setStatus(`${error.message || 'ページの読み込みに失敗しました。'}\n通信環境を確認して、もう一度お試しください。`, { error: true });
      renderRewardTimeline($('rewardTimeline'), normaliseProgress());
    }
  }

  $('submitButton').addEventListener('click', submitVote);
  $('retryButton').addEventListener('click', () => window.location.reload());
  $('shareX').addEventListener('click', () => {
    if (!state.completion) return;
    const text = buildShareText(state.completion.candidateName);
    window.location.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(CONFIG.app.shareUrl)}`;
  });
  $('shareLine').addEventListener('click', () => {
    if (!state.completion) return;
    const text = `${buildShareText(state.completion.candidateName)}\n${CONFIG.app.shareUrl}`;
    window.location.href = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  });
  $('shareInstagram').addEventListener('click', shareToInstagram);
  $('copyButton').addEventListener('click', async () => {
    if (!state.completion) return;
    const copied = await copyText(buildShareText(state.completion.candidateName));
    showToast(copied ? 'シェア文をコピーしました' : 'コピーできませんでした。長押しでコピーしてください');
  });

  initialize();
})();
