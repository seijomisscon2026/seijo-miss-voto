(function () {
  'use strict';

  /**
   * 特典素材は投票ロジックと分離して管理します。
   * 候補者別素材は byCandidate の候補者IDにURLを設定します。
   * 動画の場合は type: 'video'、画像の場合は type: 'image' を使用します。
   */
  const REWARDS = [
    {
      threshold: 15,
      key: 'wallpaper',
      chapter: 'Chapter I',
      title: '限定壁紙',
      description: 'Storyの世界をいつでもそばに。',
      asset: {
        available: true,
        type: 'image',
        url: '',
        byCandidate: {
          '01': './assets/rewards/wallpaper_01.jpeg',
          '02': './assets/rewards/wallpaper_02.jpeg',
          '03': './assets/rewards/wallpaper_03.jpeg',
          '04': './assets/rewards/wallpaper_04.jpeg',
          '05': './assets/rewards/wallpaper_05.jpeg',
        },
        poster: '',
        downloadName: 'seijo-story-wallpaper',
      },
    },
    {
      threshold: 30,
      key: 'signed_image',
      chapter: 'Chapter II',
      title: 'デジタルサイン入り画像',
      description: '応援への感謝を込めた特別な一枚。',
      asset: { available: false, type: 'image', url: '', poster: '', downloadName: 'seijo-signed-image' },
    },
    {
      threshold: 45,
      key: 'offshots',
      chapter: 'Chapter III',
      title: '未公開オフショット5枚',
      description: '舞台の裏側にある、もうひとつの物語。',
      asset: { available: false, type: 'image', url: '', poster: '', downloadName: 'seijo-offshots' },
    },
    {
      threshold: 60,
      key: 'letter',
      chapter: 'Chapter IV',
      title: '候補者からの手紙画像',
      description: '一票一票への想いを、言葉にして。',
      asset: { available: false, type: 'image', url: '', poster: '', downloadName: 'seijo-letter' },
    },
    {
      threshold: 80,
      key: 'thank_you_video',
      chapter: 'Chapter V',
      title: '20秒ありがとう動画',
      description: '物語の終幕を前に届く、感謝のメッセージ。',
      asset: { available: false, type: 'video', url: '', poster: '', downloadName: '' },
    },
    {
      threshold: 82,
      key: 'perfect_attendance_card',
      chapter: 'Final Chapter',
      title: '皆勤賞・限定フォトカード',
      description: '82日間をともに歩んだ方だけの記念品。後日発送します。',
      asset: { available: false, type: 'info', url: '', poster: '', downloadName: '' },
    },
  ];

  window.SEIJO_CONFIG = Object.freeze({
    app: Object.freeze({
      liffId: '2010561104-dKFoBUJn',
      apiUrl: 'https://script.google.com/macros/s/AKfycbwUJrs-eZnxumXT_Aa9t1986lW0J6Px3UohbpLiY_64zUDjEL2XJs4t8OqEmfm-U1drqA/exec',
      shareUrl: 'https://liff.line.me/2010561104-dKFoBUJn',
      assetVersion: 'story-20260914-wallpaper-v1',
      clientVersion: '2026-09-14-wallpaper-v1',
      maxRetries: 3,
      requestTimeoutMs: 45000,
    }),
    period: Object.freeze({
      startDate: '2026-09-01',
      endDate: '2026-11-21',
      maxVotes: 82,
    }),
    candidates: Object.freeze([
      { id: '01', name: '池端美悠', photoCount: 3 },
      { id: '02', name: '河端すみれ', photoCount: 3 },
      { id: '03', name: '坂本七海', photoCount: 3 },
      { id: '04', name: '小谷美羽', photoCount: 3 },
      { id: '05', name: '柳川円佳', photoCount: 3 },
    ]),
    rewards: Object.freeze(REWARDS),
  });
})();
