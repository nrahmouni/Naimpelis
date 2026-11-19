import type { KidsLanguageCode } from '../../types';
import { KIDS_UI_ES_CA_EN } from './kidsI18nWestern';
import { KIDS_UI_NL_FR_AR } from './kidsI18nIntl';

export function isKidsRtl(lang: KidsLanguageCode): boolean {
  return lang === 'ar';
}

export function getKidsDir(lang: KidsLanguageCode): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export interface KidsUiCopy {
  navCinema: string;
  navFun: string;
  navLearn: string;
  stepWizardShort: string;
  parentsBtn: string;
  soundOn: string;
  soundOff: string;
  calmMode: string;
  bedtimeMode: string;
  lullabyLabel: string;
  yearsLabel: string;
  albumTitlePrefix: string;
  starsAvailableSuffix: string;
  dailyMissionsTitle: string;
  chestOpenedToday: string;
  openChestReward: string;
  completeAllThree: string;
  missionWatch: string;
  missionPlay: string;
  missionLearn: string;
  missionDone: string;
  siblingsTitle: string;
  siblingPlaceholder: string;
  createBtn: string;
  chooseMascotTitle: string;
  mascotActive: string;
  mascotUse: string;
  rewardShopTitle: string;
  badgesTitle: string;
  timeUpTitle: string;
  timeUpBody: string;
  parentGateBtn: string;
  pinExitTitle: string;
  pinParentTitle: string;
  pinCastTitle: string;
  pinSubDefault: string;
  pinWrong: string;
  pinModeExit: string;
  pinModeParent: string;
  keepPlaying: string;
  parentPanelTitle: string;
  lockLangLabel: string;
  allFree: string;
  lockAgeLabel: string;
  freeLabel: string;
  screenTimerLabel: string;
  activeUsageLabel: string;
  recommendedShort: string;
  noLimit: string;
  effectsToggle: string;
  safeModeTitle: string;
  safeModeDesc: string;
  onLabel: string;
  offLabel: string;
  connectSmartTv: string;
  saveAndBack: string;
  exitKids: string;
  pinChangeTitle: string;
  pinCurrentLabel: string;
  pinNewLabel: string;
  pinSaveBtn: string;
  pinSavedMsg: string;
  pinInvalidMsg: string;
  pinResetDefaultBtn: string;
  catRecent: string;
  catAll: string;
  catCartoons: string;
  catSongs: string;
  catAnimals: string;
  catDinos: string;
  catSpace: string;
  catMagic: string;
  catLearn: string;
  parentApprovedBanner: string;
  voiceSearchLabel: string;
  searchLabel: string;
  searchPlaceholderPrefix: string;
  emptyRecent: string;
  emptyDefault: string;
  seeAllKids: string;
  formatMovie: string;
  formatSeries: string;
  catalogLoadError: string;
  catalogConnError: string;
  aiUnavailable: string;
  aiConnError: string;
  wizStep1: string;
  wizStep2: string;
  wizStep3: string;
  wizStep4: string;
  wizStepSubtitle: string;
  wizNameLabel: string;
  wizNamePlaceholder: string;
  wizAvatarLabel: string;
  wizLangHint: string;
  wizAgeHint: string;
  wizMascotHint: string;
  wizBack: string;
  wizNext: string;
  wizFinish: string;
  theaterBackToKids: string;
  theaterClaimFiveStars: string;
  theaterEarnedFiveStars: string;
  theaterCongratsSpeech: string;
  theaterPlay: string;
  theaterPause: string;
  theaterRewind: string;
  theaterForward: string;
  theaterMute: string;
  theaterUnmute: string;
  theaterVolume: string;
  theaterFullscreen: string;
  tabLanguages: string;
  tabMath: string;
  tabMemory: string;
  tarifitSpotlightTitle: string;
  tarifitSpotlightDesc: string;
  practiceModeBtn: string;
  exploreModeBtn: string;
  practicePrompt: string;
  vocabAll: string;
  vocabAnimals: string;
  vocabNature: string;
  vocabNumbers: string;
  vocabFamily: string;
  vocabTranslatePlaceholder: string;
  vocabNextWord: string;
  vocabPrevWord: string;
  mathBubblesRule: string;
  mathAdaptiveLevel: string;
  mathStreak: string;
  mathScore: string;
  mathHintBtn: string;
  mathNewRound: string;
  mathVictoryTitle: string;
  mathVictoryBody: string;
  mathTryAnother: string;
  memoryRule: string;
  memoryMovesLabel: string;
  memoryNewDeck: string;
  memoryMasteredLabel: string;
  memoryVictoryTitle: string;
  memoryVictoryBody: string;
  memoryBoxPrefix: string;
  gameStartBtn: string;
  gameRetryBtn: string;
  funStars: string;
  funSimon: string;
  funPlayNow: string;
  funPlayAgain: string;
  funSimonWatch: string;
  funSimonTurn: string;
  funSimonAlmost: string;
  funSimonTitle: string;
  funStarsDesc: string;
  levelLabel: string;
  rankExplorer: string;
  rankAdventurer: string;
  rankStarMaster: string;
  rankSuperGenius: string;
  shopOwned: string;
  shopGetBtn: string;
  shopNeedStars: string;
  chooseGamePrompt: string;
  chooseLanguageTitle: string;
  portalWelcome: string;
  portalSubtitle: string;
  portalCinemaDesc: string;
  portalFunDesc: string;
  portalLearnDesc: string;
  portalEnterBtn: string;
  portalRewardsBtn: string;
  backToHome: string;
  backToThemes: string;
  ytAgeFilteredHint: string;
}

export const KIDS_UI_TRANSLATIONS: Record<KidsLanguageCode, KidsUiCopy> = {
  ...KIDS_UI_ES_CA_EN,
  ...KIDS_UI_NL_FR_AR,
  rif: {
    navCinema: 'Sinima Kids',
    navFun: '4 Irar',
    navLearn: '8 Tutlayin',
    stepWizardShort: 'S Tsurift',
    parentsBtn: 'Lwalidin',
    soundOn: 'Aṣṣut yexdem',
    soundOff: 'Aṣṣut yens',
    calmMode: 'Amek di Lhuda',
    bedtimeMode: 'Amek n Yid',
    lullabyLabel: 'Nana',
    yearsLabel: 'iseggwasen',
    albumTitlePrefix: 'Amlaf n',
    starsAvailableSuffix: 'itran',
    dailyMissionsTitle: 'Tiggura n Wass-a (+10 itran)',
    chestOpenedToday: 'Aṣenduqq yerzem ass-a',
    openChestReward: 'Rzem Aṣenduqq +10',
    completeAllThree: 'Kemmel s 3',
    missionWatch: 'Wali afidyu',
    missionPlay: 'Urar',
    missionLearn: 'Lmed tutlayin',
    missionDone: 'Yekemmel',
    siblingsTitle: 'Imlafen deg tmacint-a',
    siblingPlaceholder: 'Isem n weḥram...',
    createBtn: 'Egg',
    chooseMascotTitle: 'Xtar ameddukkel',
    mascotActive: 'Yexdem',
    mascotUse: 'Xtar',
    rewardShopTitle: 'Beddel itran',
    badgesTitle: 'Timadayin',
    timeUpTitle: 'Lweqt n urayeh',
    timeUpBody: 'Yekemmel lweqt n wassa. Tberkallah xak.',
    parentGateBtn: 'Anekcum Lwalidin (PIN)',
    pinExitTitle: 'PIN i wuffeɣ zi Kids',
    pinParentTitle: 'Taggawt n Lwalidin',
    pinCastTitle: 'Ssek ɣer Smart TV',
    pinSubDefault: 'Ari kkuḍ n 4 n yinumruyen',
    pinWrong: 'PIN ur yeṣḥi ca. Ɛawed.',
    pinModeExit: 'Effeɣ zi Kids',
    pinModeParent: 'Taggawt Lwalidin',
    keepPlaying: 'Qqim da',
    parentPanelTitle: 'Taggawt n Lwalidin',
    lockLangLabel: 'Ṭṭef tutlayt',
    allFree: 'Kullci yarzem',
    lockAgeLabel: 'Ṭṭef lɛemr',
    freeLabel: 'Yarzem',
    screenTimerLabel: 'Lweqt n usgunfu',
    activeUsageLabel: 'Asseqdec ass-a',
    recommendedShort: 'Iw.',
    noLimit: 'Bla lḥedd',
    effectsToggle: 'Iṣuṭen',
    safeModeTitle: 'Ifidyuten i qeblen lwalidin waha',
    safeModeDesc: 'Sken ɣir ifidyuten yettuqeblen da',
    onLabel: 'Yexdem',
    offLabel: 'Yens',
    connectSmartTv: 'Zdi Smart TV',
    saveAndBack: 'Ḥfeḍ u dwer',
    exitKids: 'Effeɣ zi Kids',
    pinChangeTitle: 'Beddel PIN n Lwalidin',
    pinCurrentLabel: 'PIN n tura',
    pinNewLabel: 'PIN amaynu (4)',
    pinSaveBtn: 'Ḥfeḍ PIN',
    pinSavedMsg: 'PIN amaynu yettuḥfeḍ da',
    pinInvalidMsg: 'Wali PIN n tura t-arid 4 n yinumruyen',
    pinResetDefaultBtn: 'Err 1122',
    catRecent: 'Ttwalin',
    catAll: 'Kullci YouTube Kids',
    catCartoons: 'Imɣiwen',
    catSongs: 'Izlan',
    catAnimals: 'Iḥuyawanen',
    catDinos: 'Dinuzuren',
    catSpace: 'Ajenna',
    catMagic: 'Tiḥuja',
    catLearn: 'Almad',
    parentApprovedBanner: 'Ifidyuten i qeblen lwalidin',
    voiceSearchLabel: 'Rzu s wawal',
    searchLabel: 'Rzu',
    searchPlaceholderPrefix: 'Rzu deg YouTube Kids...',
    emptyRecent: 'War twalid ca ass-a. Xtar asental.',
    emptyDefault: 'Walou ifidyuten da',
    seeAllKids: 'Wali kullci YouTube Kids',
    formatMovie: 'KIDS',
    formatSeries: 'KIDS',
    catalogLoadError: 'Ur yezmir ad d-yawi YouTube Kids tura.',
    catalogConnError: 'Tuccḍa deg tuqqna.',
    aiUnavailable: 'Amawal ur yexdim ca tura.',
    aiConnError: 'Tuccḍa deg umawal.',
    wizStep1: 'Tasurift 1: Isem-nnek d tmidayt',
    wizStep2: 'Tasurift 2: Min tutlayt texsed?',
    wizStep3: 'Tasurift 3: Mecḥal n yiseggwasen ɣark?',
    wizStep4: 'Tasurift 4: Xtar ameddukkel-nnek',
    wizStepSubtitle: 'Ssewjed amlaf n weḥram',
    wizNameLabel: 'Isem-nnek',
    wizNamePlaceholder: 'Amedya: Adam, Leo, Nora...',
    wizAvatarLabel: 'Xtar tmidat-nnek',
    wizLangHint: 'Sel i sslam din din ma tuxtared tutlayt',
    wizAgeHint: 'Yettbeddal aswir n YouTube Kids d wurar',
    wizMascotHint: 'Ameddukkel-nnek ad yeqqim akidek',
    wizBack: 'Dwer',
    wizNext: 'Zdat',
    wizFinish: 'Bdu',
    theaterBackToKids: 'Dwer ɣer Sinima',
    theaterClaimFiveStars: 'Kemmel +5',
    theaterEarnedFiveStars: '+5 Itran terbiḥed',
    theaterCongratsSpeech: 'Ayuz. Tekemmeled afidyu terbiḥed xemsa n yitran.',
    theaterPlay: 'Bdu',
    theaterPause: 'Ḥbes',
    theaterRewind: 'Dwer 10 s',
    theaterForward: 'Zdat 10 s',
    theaterMute: 'Susem',
    theaterUnmute: 'Rzem aṣṣut',
    theaterVolume: 'Aṣṣut',
    theaterFullscreen: 'Agdil ikemmel',
    tabLanguages: 'Almad 8 Tutlayin',
    tabMath: 'Tibuliyin n Lḥisab',
    tabMemory: 'Aktay Leitner',
    tarifitSpotlightTitle: 'Almad n 8 Tutlayin',
    tarifitSpotlightDesc: 'Xtar tutlayt i texsed bac ad tesled u ad tlemmed s wurar',
    practiceModeBtn: 'Asefruri',
    exploreModeBtn: 'Wali 8 tutlayin',
    practicePrompt: 'Sel niɣ wali tawlaft t-uxtared awal iṣeḥḥan',
    vocabAll: 'Kullci',
    vocabAnimals: 'Iḥuyawanen',
    vocabNature: 'Tadart',
    vocabNumbers: 'Inumruyen',
    vocabFamily: 'Taddart',
    vocabTranslatePlaceholder: 'Ari awal...',
    vocabNextWord: 'Zdat',
    vocabPrevWord: 'Dwer',
    mathBubblesRule: 'Nqeḍ tabuliyt i t-yellan deg-s lḥisab iṣeḥḥan',
    mathAdaptiveLevel: 'Aswir',
    mathStreak: 'Amseqqar',
    mathScore: 'Inuqṭen',
    mathHintBtn: 'Tallalt',
    mathNewRound: 'Beddel',
    mathVictoryTitle: 'Tekemmeled',
    mathVictoryBody: 'Tefruḍ kullci tibuliyin n lḥisab.',
    mathTryAnother: 'Ɛawed s unumru nniḍen',
    memoryRule: 'Mseqqar tawlaft aked wawal (Leitner)',
    memoryMovesLabel: 'isurifen',
    memoryNewDeck: 'Urar amaynu',
    memoryMasteredLabel: 'Ttlemden',
    memoryVictoryTitle: 'Aktay yekemmel',
    memoryVictoryBody: 'Tufid kullci tikerḍiwin s snat tutlayin.',
    memoryBoxPrefix: 'Aswir',
    gameStartBtn: 'Bdu',
    gameRetryBtn: 'Ɛawed urar',
    funStars: 'Ṭṭef Itran',
    funSimon: 'Simon n Uẓawan',
    funPlayNow: 'Urar tura',
    funPlayAgain: 'Ɛawed urar',
    funSimonWatch: 'Wali u sel',
    funSimonTurn: 'Nuba-nnek',
    funSimonAlmost: 'Qrib, ɛawed',
    funSimonTitle: 'Simon n Uẓawan',
    funStarsDesc: 'Sseḥrek aɣerrabu bac ad teṭṭfed itran u ad tneffred zi tmura',
    levelLabel: 'Aswir',
    rankExplorer: 'Amnadi',
    rankAdventurer: 'Amessafri',
    rankStarMaster: 'Bab n Yitran',
    rankSuperGenius: 'Amussnaw',
    shopOwned: 'Innek',
    shopGetBtn: 'Beddel',
    shopNeedStars: 'Xessen itran kṭer',
    chooseGamePrompt: 'Xtar yiwen zi 4 n wurar',
    chooseLanguageTitle: 'Tutlayt n Riffan Kids',
    portalWelcome: 'Azul, {name}',
    portalSubtitle: 'YouTube Kids s laman, 8 tutlayin d 4 n wurar ifazen',
    portalCinemaDesc: 'Ifidyuten s tutlayt d lɛemr deg uɣenja yeṣfan',
    portalFunDesc: 'Aɣerrabu n Yitran, Lḥisab, Aktay d DJ Simon',
    portalLearnDesc: 'Lmed awalen s 8 n tutlayin s wawal',
    portalEnterBtn: 'Adef',
    portalRewardsBtn: 'Amlaf d Yitran',
    backToHome: 'Tazwara',
    backToThemes: 'Isental',
    ytAgeFilteredHint: 'YouTube Kids waha · S tutlayt d lɛemr',
  },
  zh: {
    navCinema: '儿童影院',
    navFun: '4 款游戏',
    navLearn: '8 种语言',
    stepWizardShort: '引导设置',
    parentsBtn: '家长设置',
    soundOn: '声音开启',
    soundOff: '声音关闭',
    calmMode: '舒缓模式',
    bedtimeMode: '夜间护眼',
    lullabyLabel: '摇篮曲',
    yearsLabel: '岁',
    albumTitlePrefix: '个人主页:',
    starsAvailableSuffix: '颗星星',
    dailyMissionsTitle: '今日任务 (+10 颗星星)',
    chestOpenedToday: '今日宝箱已开启',
    openChestReward: '开启宝箱 +10',
    completeAllThree: '完成全部 3 项',
    missionWatch: '观看视频',
    missionPlay: '玩游戏',
    missionLearn: '练习语言',
    missionDone: '已完成',
    siblingsTitle: '本设备儿童档案',
    siblingPlaceholder: '输入宝宝昵称...',
    createBtn: '创建',
    chooseMascotTitle: '选择你的学习伙伴',
    mascotActive: '当前伙伴',
    mascotUse: '选择',
    rewardShopTitle: '星星兑换商店',
    badgesTitle: '荣誉徽章',
    timeUpTitle: '休息时间到',
    timeUpBody: '今天的屏幕时间已结束，表现真棒！',
    parentGateBtn: '家长入口 (PIN)',
    pinExitTitle: '输入 PIN 退出儿童区',
    pinParentTitle: '家长控制中心',
    pinCastTitle: '投屏到智能电视',
    pinSubDefault: '请输入 4 位数字密码',
    pinWrong: '密码错误，请重试。',
    pinModeExit: '退出儿童区',
    pinModeParent: '家长控制',
    keepPlaying: '继续游玩',
    parentPanelTitle: '家长控制（仅限本地设备）',
    lockLangLabel: '锁定默认语言',
    allFree: '自由选择',
    lockAgeLabel: '锁定年龄段',
    freeLabel: '不限',
    screenTimerLabel: '休息计时器',
    activeUsageLabel: '今日已使用',
    recommendedShort: '推荐',
    noLimit: '不限时',
    effectsToggle: '音效',
    safeModeTitle: '仅播放已批准视频',
    safeModeDesc: '仅展示本设备上家长精选与收藏的视频',
    onLabel: '已开启',
    offLabel: '已关闭',
    connectSmartTv: '配对智能电视',
    saveAndBack: '保存并返回',
    exitKids: '退出儿童区',
    pinChangeTitle: '修改家长 PIN 码（仅本机）',
    pinCurrentLabel: '当前 PIN',
    pinNewLabel: '新 PIN (4位数字)',
    pinSaveBtn: '保存 PIN',
    pinSavedMsg: '新 PIN 已保存到本设备',
    pinInvalidMsg: '请检查当前 PIN 并输入 4 位数字',
    pinResetDefaultBtn: '重置为 1122',
    catRecent: '最近观看',
    catAll: '全部 YouTube Kids',
    catCartoons: '动画片',
    catSongs: '儿歌',
    catAnimals: '动物世界',
    catDinos: '恐龙',
    catSpace: '太空探险',
    catMagic: '童话故事',
    catLearn: '趣味启蒙',
    parentApprovedBanner: '家长已精选内容',
    voiceSearchLabel: '语音搜索',
    searchLabel: '搜索',
    searchPlaceholderPrefix: '搜索 YouTube Kids...',
    emptyRecent: '今天还没有看过视频哦，先选一个主题吧。',
    emptyDefault: '这里暂时没有找到视频',
    seeAllKids: '浏览全部 YouTube Kids',
    formatMovie: 'KIDS',
    formatSeries: 'KIDS',
    catalogLoadError: '暂时无法加载 YouTube Kids。',
    catalogConnError: '加载视频时连接出错。',
    aiUnavailable: '智能词典暂不可用。',
    aiConnError: '无法连接词典服务。',
    wizStep1: '第 1 步：你的名字和徽章',
    wizStep2: '第 2 步：选择探索的语言',
    wizStep3: '第 3 步：你几岁啦？',
    wizStep4: '第 4 步：选择你的学习伙伴',
    wizStepSubtitle: '设置儿童专属档案',
    wizNameLabel: '你的名字',
    wizNamePlaceholder: '例如：Leo、Nora、小宇...',
    wizAvatarLabel: '选择你的徽章',
    wizLangHint: '点击语言即可立即试听欢迎语音',
    wizAgeHint: '自动适配 YouTube Kids 过滤与游戏难度',
    wizMascotHint: '你的伙伴将全程陪伴你探索各专区',
    wizBack: '上一步',
    wizNext: '下一步',
    wizFinish: '开始探索',
    theaterBackToKids: '返回影院',
    theaterClaimFiveStars: '完成 +5 星',
    theaterEarnedFiveStars: '获得 +5 颗星星',
    theaterCongratsSpeech: '真棒！你已经看完了视频，获得了五颗星星。',
    theaterPlay: '播放',
    theaterPause: '暂停',
    theaterRewind: '快退 10 秒',
    theaterForward: '快进 10 秒',
    theaterMute: '静音',
    theaterUnmute: '开启声音',
    theaterVolume: '音量',
    theaterFullscreen: '全屏',
    tabLanguages: '8 国语言工作室',
    tabMath: '算术泡泡',
    tabMemory: '记忆卡片',
    tarifitSpotlightTitle: '8 国语言工作室',
    tarifitSpotlightDesc: '点击任意语言收听发音、对比词汇并参与互动挑战',
    practiceModeBtn: '看图猜词',
    exploreModeBtn: '探索 8 种语言',
    practicePrompt: '听发音或看图片，选出正确的单词',
    vocabAll: '全部',
    vocabAnimals: '动物',
    vocabNature: '自然',
    vocabNumbers: '数字',
    vocabFamily: '家庭',
    vocabTranslatePlaceholder: '输入单词进行翻译...',
    vocabNextWord: '下一个',
    vocabPrevWord: '上一个',
    mathBubblesRule: '点击带有正确答案的气泡或数字键',
    mathAdaptiveLevel: '等级',
    mathStreak: '连胜',
    mathScore: '得分',
    mathHintBtn: '提示',
    mathNewRound: '换一题',
    mathVictoryTitle: '挑战成功',
    mathVictoryBody: '你解开了所有的数字泡泡！',
    mathTryAnother: '再试一个数字',
    memoryRule: '将插图与对应单词配对 (Leitner)',
    memoryMovesLabel: '步数',
    memoryNewDeck: '重新洗牌',
    memoryMasteredLabel: '已掌握',
    memoryVictoryTitle: '记忆挑战完成',
    memoryVictoryBody: '你配对了所有双语记忆卡片！',
    memoryBoxPrefix: '熟练度',
    gameStartBtn: '开始',
    gameRetryBtn: '再玩一次',
    funStars: '摘星星大作战',
    funSimon: '音乐西蒙',
    funPlayNow: '立即开始',
    funPlayAgain: '再玩一次',
    funSimonWatch: '仔细看和听',
    funSimonTurn: '轮到你了',
    funSimonAlmost: '差一点，再试一次',
    funSimonTitle: '音乐西蒙',
    funStarsDesc: '驾驶飞船收集星星和宝石，小心躲避陨石',
    levelLabel: '等级',
    rankExplorer: '小小探险家',
    rankAdventurer: '勇敢冒险者',
    rankStarMaster: '星际大师',
    rankSuperGenius: '超级小天才',
    shopOwned: '已拥有',
    shopGetBtn: '兑换',
    shopNeedStars: '星星还不够哦',
    chooseGamePrompt: '从 4 款精选游戏中选一款开始吧',
    chooseLanguageTitle: 'Riffan Kids 界面语言',
    portalWelcome: '你好，{name}',
    portalSubtitle: '安全纯净的 YouTube Kids、8 国互动语言和 4 款街机益智游戏',
    portalCinemaDesc: '按语言与年龄智能过滤的 YouTube Kids 纯净影院',
    portalFunDesc: '星际飞行员、珊瑚算术、双语记忆与 DJ 西蒙音律挑战',
    portalLearnDesc: '通过真实语音朗读，轻松学习与练习 8 种语言日常词汇',
    portalEnterBtn: '进入',
    portalRewardsBtn: '档案与星星',
    backToHome: '首页',
    backToThemes: '主题分类',
    ytAgeFilteredHint: '仅限 YouTube Kids · 已按语言与年龄过滤',
  },
};

export function getKidsUiCopy(lang: KidsLanguageCode): KidsUiCopy {
  return KIDS_UI_TRANSLATIONS[lang] || KIDS_UI_TRANSLATIONS.es;
}
