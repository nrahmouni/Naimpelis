#!/usr/bin/env python3
import json
import re

with open("/tmp/all_pairs.json") as f:
    pairs = json.load(f)

# Comprehensive vocabulary mapping
VOCAB = {
    # Navigation & Core
    "Explore": "探索",
    "Series & Movies": "影视剧集",
    "Movies": "电影",
    "Movie": "电影",
    "Series": "剧集",
    "TV Series": "电视剧集",
    "Anime": "动漫",
    "Live TV": "电视直播",
    "Live TV & Sports": "电视与体育直播",
    "Football": "足球",
    "Live Sports": "体育直播",
    "Sports": "体育",
    "YouTube": "YouTube",
    "Games": "互动游戏",
    "My List": "我的片单",
    "Watchlist": "片单",
    "Favorites": "我的收藏",
    "History": "播放记录",
    "Recent": "最近播放",
    "Continue watching": "继续观看",
    "Profile": "个人中心",
    "Lobby": "大厅",
    "Room": "房间",
    "Chat": "聊天",
    "Queue": "播放队列",
    "Queue · Link": "播放队列 · 直链",
    "Settings": "设置",
    "Account": "账号",
    "Saved": "已保存",
    "Signed in": "已登录",
    "Guest profile": "访客模式",
    "Guest": "访客",
    "Sign in": "登录",
    "Sign out": "退出登录",
    "Sign in with Google and sync to cloud": "使用 Google 登录并同步至云端",

    # Channels & TV
    "All Channels": "全部频道",
    "Spain": "西班牙",
    "Spain DTT": "西班牙全国地面数字电视",
    "Generalists": "全国综合台",
    "Main TV": "全国综合台",
    "Regional": "大区频道",
    "Morocco": "摩洛哥",
    "Morocco TV": "摩洛哥电视",
    "Morocco & Arab World": "摩洛哥与阿拉伯世界",
    "Arab World": "阿拉伯世界",
    "News": "新闻资讯",
    "News & Sports": "新闻与体育",
    "Documentaries": "纪录片",
    "Docs": "纪录片",
    "Documentaries & Nature": "纪录片与自然探索",
    "Kids": "少儿动漫",
    "Infantile": "少儿动漫",
    "Kids / Regional": "少儿 / 地方大区",
    "Music": "音乐频道",
    "Music & Party 24h": "音乐与派对频道 24小时",
    "International": "国际频道",
    "USA": "美国频道",
    "USA & International Channels": "美国与国际频道",
    "Europe": "欧洲频道",
    "Latam / ES": "拉美 / 西班牙",
    "UK (EN)": "英国 (英语)",
    "China (中文)": "中国 (中文)",
    "China 中文": "中国 (中文)",
    "UK Sports": "英国体育",
    "beIN Arabic": "beIN 阿拉伯语",
    "beIN ES": "beIN 西班牙",
    "Al Jazeera / MENA": "半岛电视台 / 中东",
    "Channel Guide & TV Schedule": "频道节目指南与日程表",
    "Live TV Guide": "电视直播节目单",
    "TV Guide": "电视节目指南",
    "Refresh TV guide": "刷新节目单",
    "Show guide": "展开节目单",
    "Hide guide": "收起节目单",
    "Viewing schedule for": "正在查看节目日程：",
    "Back to current": "返回当前频道",
    "Channel Schedule": "频道节目表",
    "programs today": "个今日节目",
    "LIVE": "直播中",
    "Live": "直播",
    "Less": "收起",
    "Read more": "展开阅读",
    "Show less": "收起简介",
    "Up Next": "即将播出",
    "Browse all channels": "浏览全部频道",
    "Full Schedule Today": "今日完整节目单",
    "Tap a show for details": "点击节目查看详情",
    "Playing": "正在播放",
    "View full schedule": "查看完整节目单",
    "Guide": "节目单",
    "Watch": "播放",
    "Watch now": "立即观看",
    "Similar Channels": "相似频道",
    "Swipe and tap any channel to zap instantly": "滑动并点击任意频道即可秒级换台",
    "Feed 1": "信号 1",
    "Feed 2": "信号 2",
    "Feed 3": "信号 3",
    "Feed 4": "信号 4",
    "Feed 5": "信号 5",
    "Signal 1": "信号 1",
    "Signal 2": "信号 2",
    "Signal 3": "信号 3",
    "Signal 4": "信号 4",
    "Signals": "信号源",
    "Feed": "信号",

    # Search & Filters
    "Search": "搜索",
    "Search movie, series or URL...": "搜索电影、剧集或视频链接...",
    "Search match, team or channel...": "搜索比赛、球队或频道...",
    "Search channel or show...": "搜索频道或节目...",
    "Search YouTube...": "在 YouTube 中搜索...",
    "Search channel, movie, show, or live match...": "搜索频道、电影、剧集或直播赛事...",
    "Search movies, series, channels...": "搜索电影、剧集、频道...",
    "Search or add friends": "搜索或添加好友",
    "Search web": "在网络中搜索",
    "Search with AI": "使用 AI 智能搜索",
    "Smart AI Web Search": "AI 网页智能搜索",
    "Search here...": "在此搜索...",
    "Clear search": "清空搜索",
    "Clear filter": "清除筛选",
    "Clean filters": "重置筛选条件",
    "Filtered results": "筛选结果",
    "Filters": "筛选",
    "Filters ·": "筛选 ·",
    "Trending": "热门推荐",
    "Popular": "高分热门",
    "Top Rated": "巅峰榜单",
    "New Releases": "最新上线",
    "Latest": "最新更新",
    "All genres": "全部题材",
    "VO · English": "原声 · 英语",
    "Catalan Anime": "加泰语动漫",
    "4K Catalog": "4K 高清片库",
    "Movies, series & anime in 4K": "4K 电影、剧集与动漫",
    "Browse": "探索浏览",
    "See all": "查看全部",

    # Matchboard & Sports
    "Today's matches & live feeds": "今日焦点赛事与直播信号",
    "Save match": "收藏比赛",
    "Stats & lineups": "比赛数据与首发阵容",
    "Second screen": "第二屏幕",
    "Match finished.": "全场比赛结束。",
    "Halftime": "半场结束",
    "Fulltime": "全场结束",
    "FT": "完场",
    "HT": "半场",
    "Upcoming": "即将开始",
    "Finished": "已结束",
    "Table": "积分榜",
    "Standings": "积分榜",
    "Lineup": "首发阵容",
    "Lineups": "双方阵容",
    "Commentary": "文字直播",
    "Statistics": "比赛数据",
    "Stats": "技术统计",
    "Ball Possession": "控球率",
    "Shots on Target": "射正次数",
    "Total Shots": "总射门数",
    "Fouls": "犯规次数",
    "Corner Kicks": "角球次数",
    "Offsides": "越位次数",
    "Yellow Cards": "黄牌",
    "Red Cards": "红牌",
    "Substitutions": "换人调整",

    # Watch Party & Friends
    "Friends & invites": "好友与邀请",
    "Your code and room invites": "你的好友码与房间邀请",
    "My code": "我的好友码",
    "Friend": "好友",
    "Friends": "好友",
    "Watch Party": "同步观影",
    "Create room": "创建房间",
    "Create room & enter": "创建并进入房间",
    "Join room": "加入房间",
    "Join with code or link": "通过房间码或链接加入",
    "Join": "加入",
    "Enter a room code or invite link": "输入房间码或邀请链接",
    "Room Code": "房间码",
    "Room Code:": "房间码：",
    "Invite": "邀请好友",
    "Invite Friends": "邀请好友",
    "Copy invite link": "复制邀请链接",
    "Copy Link": "复制链接",
    "Copied": "已复制",
    "Link copied": "链接已复制",
    "Link copied!": "邀请链接已复制！",
    "Leave room": "退出房间",
    "Exit room": "退出房间",
    "Leave": "退出",
    "Participants": "在线成员",
    "Host": "房主",
    "Co-host": "管理员",
    "Make host": "设为房主",
    "Make co-host": "设为管理员",
    "Remove co-host": "取消管理员",
    "You": "你",
    "Kick": "移出房间",
    "In room": "房间内",
    "Playing in room": "房间正在播放",
    "Send message": "发送消息",
    "Send": "发送",
    "Type a message...": "输入聊天消息...",
    "Reactions": "表情互动",
    "Clear chat": "清空聊天记录",
    "Room Settings": "房间设置",
    "Stop room": "停止房间放映",
    "Reopen": "重新打开",
    "Resync": "重新同步",
    "Sync Room": "同步房间",
    "Room in sync": "房间已保持同步",
    "Queued:": "队列中：",
    "Vote to skip": "投票跳过",
    "Next in queue:": "队列下一个：",
    "Queue is empty": "播放队列为空",

    # Smart TV & Cast
    "Cast TV": "投屏",
    "Cast to TV": "投屏到电视",
    "AirPlay": "隔空播放",
    "Smart TV": "智能电视",
    "Pair TV": "连接电视",
    "Pair with TV": "配对智能电视",
    "Pair Smart TV": "连接智能电视",
    "TV paired": "智能电视已连接",
    "Enter 4-digit code": "输入4位配对码",
    "Enter these 4 digits on your phone": "在手机上输入这4位配对码",
    "Enter the 4 digits shown on /tv": "输入电视上显示的4位配对码",
    "Disconnect": "断开连接",
    "Disconnect TV": "断开电视连接",

    # Player Controls
    "Play": "播放",
    "Pause": "暂停",
    "Resume": "继续播放",
    "Mute": "静音",
    "Unmute": "取消静音",
    "Tap to unmute": "点击开启声音",
    "Volume": "音量",
    "Fullscreen": "全屏",
    "Exit Fullscreen": "退出全屏",
    "Picture in Picture": "画中画",
    "PiP": "画中画",
    "Speed": "播放速度",
    "Quality": "画质",
    "Audio track": "音轨",
    "Audio tracks": "音频轨道",
    "Subtitles": "字幕",
    "Subtitle offset": "字幕延迟调节",
    "Sync offset": "音频同步延迟",
    "Ambient lighting": "影院氛围灯",
    "Ambient Light": "影院氛围灯",
    "Vocal boost": "人声增强",
    "Vocal Boost": "人声增强",
    "Auto": "自动",
    "Embedded audio": "内置音轨",
    "Embedded subtitles": "内置字幕",
    "No subtitles": "无字幕",

    # Actions & States
    "Cancel": "取消",
    "Close": "关闭",
    "Close dialog": "关闭窗口",
    "Done": "完成",
    "Back": "返回",
    "Next": "下一个",
    "Previous": "上一个",
    "Retry": "重试",
    "Refresh": "刷新",
    "Reset": "重置",
    "Save": "保存",
    "Loading...": "加载中...",
    "Connecting...": "连接中...",
    "Extracting...": "解析中...",
    "Buffering...": "缓冲中...",
    "Install": "安装",
    "Update": "更新",
    "Download": "下载",
    "Share": "分享",
    "Delete": "删除",
    "Remove": "移除",
    "Clear": "清空",
    "Clear all": "全部清空",
    "Apply": "应用",
    "OK": "确认",
    "Yes": "是",
    "No": "否",
}

# Translate individual pair
def translate_pair(en_str, es_str):
    s = en_str.strip()
    if s in VOCAB:
        return VOCAB[s]

    # Regex patterns for dynamic strings
    m = re.match(r"^Room #(.+)$", s, re.I)
    if m:
        return f"房间 #{m.group(1)}"
    m = re.match(r"^(\d+)\s+channels?$", s, re.I)
    if m:
        return f"{m.group(1)} 个频道"
    m = re.match(r"^(\d+)\s+available$", s, re.I)
    if m:
        return f"{m.group(1)} 个可用"
    m = re.match(r"^(\d+)\s+live$", s, re.I)
    if m:
        return f"{m.group(1)} 场直播"
    m = re.match(r"^(\d+)\s+matches?$", s, re.I)
    if m:
        return f"{m.group(1)} 场比赛"
    m = re.match(r"^(\d+)\s+programs? today$", s, re.I)
    if m:
        return f"{m.group(1)} 个今日节目"
    m = re.match(r"^(\d+)\s+titles?$", s, re.I)
    if m:
        return f"{m.group(1)} 部作品"
    m = re.match(r"^(\d+)\s+episodes?$", s, re.I)
    if m:
        return f"{m.group(1)} 集"
    m = re.match(r"^Season (\d+)$", s, re.I)
    if m:
        return f"第 {m.group(1)} 季"
    m = re.match(r"^Episode (\d+)$", s, re.I)
    if m:
        return f"第 {m.group(1)} 集"
    m = re.match(r"^Cap[ií]tulo (\d+)$", es_str, re.I)
    if m:
        return f"第 {m.group(1)} 集"
    m = re.match(r"^Dial (\d+)$", s, re.I)
    if m:
        return f"频道号 {m.group(1)}"
    m = re.match(r"^(\d+)\s*min$", s, re.I)
    if m:
        return f"{m.group(1)} 分钟"
    m = re.match(r"^(\d+)\s*h(?:\s*(\d+)\s*min)?$", s, re.I)
    if m:
        if m.group(2):
            return f"{m.group(1)} 小时 {m.group(2)} 分钟"
        return f"{m.group(1)} 小时"

    # Known Spanish / English phrases from codebase
    low_es = es_str.lower()
    low_en = s.lower()

    if "buscar película" in low_es or "search movie" in low_en:
        return "搜索电影、剧集或链接..."
    if "buscar partido" in low_es or "search match" in low_en:
        return "搜索比赛、球队或频道..."
    if "buscar canal" in low_es or "search channel" in low_en:
        return "搜索频道或节目..."
    if "buscar en youtube" in low_es or "search youtube" in low_en:
        return "在 YouTube 中搜索..."
    if "reproducir ahora" in low_es or "watch now" in low_en:
        return "立即播放"
    if "a la cola" in low_es or "add to queue" in low_en:
        return "加入队列"
    if "mi lista" in low_es or "my list" in low_en:
        return "我的片单"
    if "ficha y similares" in low_es or "movie info" in low_en:
        return "影视详情与推荐"
    if "canales similares" in low_es or "similar channels" in low_en:
        return "相似频道"
    if "guía tv en directo" in low_es or "live tv guide" in low_en:
        return "电视直播节目单"
    if "parrilla del canal" in low_es or "channel schedule" in low_en:
        return "频道节目表"
    if "programación completa" in low_es or "full schedule" in low_en:
        return "今日完整节目单"
    if "siguiente" in low_es or "up next" in low_en:
        return "即将播出"
    if "viendo" in low_es or "playing" in low_en:
        return "正在播放"
    if "consultando programación" in low_es or "viewing schedule" in low_en:
        return "正在查看节目日程："
    if "volver al canal actual" in low_es or "back to current" in low_en:
        return "返回当前频道"
    if "desliza y toca" in low_es:
        return "滑动并点击任意频道即可秒级换台"
    if "abrir mi perfil" in low_es:
        return "打开个人中心（历史、收藏、房间与设置）"
    if "tu nombre en la sala" in low_es or "your display name" in low_en:
        return "你的房间昵称"
    if "escribe un mensaje" in low_es or "message your room" in low_en:
        return "输入聊天消息..."
    if "amigos en la sala" in low_es or "friends in room" in low_en:
        return "在线好友"
    if "conectar señal" in low_es or "connecting signal" in low_en:
        return "正在连接信号…"
    if "sincronizando con tu sala" in low_es or "syncing with your room" in low_en:
        return "正在与房间同步"
    if "sala lista para proyectar" in low_es or "ready to screen" in low_en:
        return "房间已准备就绪"
    if "pasar a reproductor hd" in low_es or "switch to hd player" in low_en:
        return "切换高清播放器"
    if "abrir navegador web" in low_es or "open web browser" in low_en:
        return "打开内置网页"
    if "reproducir en reproductor" in low_es or "play in player" in low_en:
        return "在播放器中播放"
    if "silenciar avance" in low_es or "mute preview" in low_en:
        return "静音预览"
    if "sonido del avance" in low_es or "unmute preview" in low_en:
        return "开启预览声音"
    if "centro de notificaciones" in low_es or "notifications" in low_en:
        return "通知中心"
    if "sorpréndeme" in low_es or "surprise me" in low_en:
        return "随机推荐"
    if "privacidad" in low_es or "privacy" in low_en:
        return "隐私政策与条款"
    if "calidad de vídeo" in low_es or "video quality" in low_en:
        return "视频画质"
    if "pista de audio" in low_es or "audio track" in low_en:
        return "音轨"
    if "cerrar ventana" in low_es or "close dialog" in low_en:
        return "关闭窗口"
    if "ver ahora" in low_es or "watch now" in low_en:
        return "立即观看"
    if "activar sonido" in low_es or "unmute audio" in low_en:
        return "点击开启声音"
    if "en directo" in low_es or "live now" in low_en:
        return "直播中"
    if "sincronizar" in low_es or "sync" in low_en:
        return "同步"
    if "invitar" in low_es or "invite" in low_en:
        return "邀请好友"
    if "salir" in low_es or "leave" in low_en:
        return "退出"
    if "enviar" in low_es or "send" in low_en:
        return "发送"
    if "anfitrión" in low_es or "host" in low_en:
        return "房主"
    if "co-anfitrión" in low_es or "co-host" in low_en:
        return "管理员"
    if "copiar enlace" in low_es or "copy link" in low_en:
        return "复制邀请链接"
    if "copiado" in low_es or "copied" in low_en:
        return "已复制"

    # Default fallback: return Spanish or English if unknown
    return None

# Build dictionary
result = {}
untranslated = []

for en, es in pairs:
    zh = translate_pair(en, es)
    if zh:
        result[en] = zh
        if es != en:
            result[es] = zh
    else:
        untranslated.append((en, es))

print(f"Total pairs: {len(pairs)}")
print(f"Direct translations generated: {len(result)}")
print(f"Untranslated count: {len(untranslated)}")
