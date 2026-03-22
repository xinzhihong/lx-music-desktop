<template>
  <div :class="$style.page">
    <!-- 未登录状态 - 直接显示登录表单 -->
    <Login v-if="!isLoggedIn" />
    
    <!-- 已登录状态 -->
    <template v-else>
      <!-- 用户信息 -->
      <div :class="$style.header">
        <img :src="userInfo.pic || defaultAvatar" :class="$style.avatar" @error="handleAvatarError" />
        <div :class="$style.userInfo">
          <h3>{{ userInfo.nickname || '网易云用户' }}<span v-if="vipDisplayText" :class="[$style.vipBadge, { [$style.vipExpired]: isVipExpired }]">{{ vipDisplayText }}</span></h3>
          <span>ID: {{ userInfo.userid }}</span>
        </div>
        <button :class="$style.logoutBtn" @click="logout">退出</button>
      </div>
      
      <!-- 每日推荐 -->
      <div :class="$style.section">
        <div :class="$style.sectionHeader">
          <h2>🎵 每日推荐</h2>
          <div :class="$style.btnGroup">
            <button :class="$style.playAllBtn" :disabled="loading || dailySongs.length === 0" @click="playAll">
              ▶ 播放全部
            </button>
            <button :class="$style.playAllBtn" :disabled="loading || dailySongs.length === 0" @click="openAddAllDialog">
              ♡ 收藏全部
            </button>
            <button :class="$style.refreshBtn" :disabled="loading" @click="loadDailyRecommend">
              {{ loading ? '加载中' : '刷新' }}
            </button>
          </div>
        </div>
        
        <!-- 加载中 -->
        <div v-if="loading" :class="$style.loading">
          <div :class="$style.spinner"></div>
        </div>
        
        <!-- 空状态 -->
        <div v-else-if="dailySongs.length === 0" :class="$style.empty">
          <p>暂无推荐歌曲，点击刷新</p>
        </div>
        
        <!-- 歌曲列表 -->
        <div v-else :class="$style.songList">
          <div 
            v-for="(song, idx) in dailySongs" 
            :key="song.id || idx" 
            :class="$style.songItem"
            @click="playSong(idx)"
            @contextmenu.prevent="handleContextMenu($event, idx)"
          >
            <span :class="$style.index">{{ idx + 1 }}</span>
            <img :src="song.album_img || defaultCover" :class="$style.cover" @error="handleImgError" />
            <div :class="$style.songInfo">
              <div :class="$style.songName">{{ song.songname || '未知' }}</div>
              <div :class="$style.songArtist">{{ song.singer || '未知' }}</div>
            </div>
            <span :class="$style.duration">{{ formatTime(song.duration) }}</span>
            <button :class="$style.addBtn" @click.stop="openAddDialog(idx)" title="添加到收藏">♡</button>
          </div>
        </div>
      </div>
    </template>
    
    <!-- 添加到列表对话框 -->
    <ListAddMultipleModal 
      :show="showAddDialog" 
      :music-list="dialogMusicList"
      @update:show="showAddDialog = $event"
      @confirm="handleAddConfirm"
    />
    
    <!-- 右键菜单 -->
    <BaseMenu 
      v-model="menuVisible"
      :xy="menuPosition"
      :menus="menuItems"
      @menu-click="handleMenuClick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { LIST_IDS } from '@common/constants'
import { playList } from '@renderer/core/player/action'
import { getListMusics, addListMusics, clearListMusics } from '@renderer/store/list/action'
import { assertApiSupport } from '@renderer/store/utils'
import ListAddMultipleModal from '@renderer/components/common/ListAddMultipleModal.vue'
import BaseMenu from '@renderer/components/base/Menu.vue'
import Login from './Login.vue'

const router = useRouter()
const API_BASE = 'http://127.0.0.1:6522'

const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI2ZmNjMyOCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTUlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjE2IiBmaWxsPSJ3aGl0ZSI+4p2kPC90ZXh0Pjwvc3ZnPg=='
const defaultCover = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNmNWY1ZjUiLz48dGV4dCB4PSI1MCUiIHk9IjU1JSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxNiIgZmlsbD0iI2NjYyI+4p2kPC90ZXh0Pjwvc3ZnPg=='

const loading = ref(false)
const dailySongs = ref<any[]>([])
const showAddDialog = ref(false)
const dialogMusicList = ref<any[]>([])

// VIP 信息用 ref 存储（确保响应式更新）
const vipInfo = ref({
  type: parseInt(localStorage.getItem('netease_vip_type') || '0'),
  level: parseInt(localStorage.getItem('netease_vip_level') || '0'),
  redLevel: parseInt(localStorage.getItem('netease_vip_red_vip_level') || localStorage.getItem('netease_red_vip_level') || '0'),
  expire: parseInt(localStorage.getItem('netease_vip_expire') || '0'),
})

// 右键菜单相关
const menuVisible = ref(false)
const menuPosition = ref({ x: 0, y: 0 })
const currentSongIndex = ref(-1)
const menuItems = [
  { action: 'fav', name: '收藏' },
  { action: 'search', name: '搜索' },
  { action: 'dislike', name: '不喜欢' },
]

const userInfo = computed(() => ({
  token: localStorage.getItem('netease_token') || '',
  userid: localStorage.getItem('netease_userid') || '',
  pic: localStorage.getItem('netease_pic') || '',
  nickname: localStorage.getItem('netease_nickname') || '',
  vipType: vipInfo.value.type,
  vipLevel: vipInfo.value.level,
  redVipLevel: vipInfo.value.redLevel,
  vipExpireTime: vipInfo.value.expire,
}))

const isLoggedIn = computed(() => !!(userInfo.value.token || userInfo.value.userid))

// VIP 显示文本
const vipDisplayText = computed(() => {
  const vt = vipInfo.value.type
  const rl = vipInfo.value.redLevel
  const expireTime = vipInfo.value.expire
  if (vt === 0 && rl === 0) return ''
  
  // 不区分年费/季度/月费，直接显示 VIP 类型 + 等级
  let text = ''
  if (vt >= 2) text = '黑胶VIP'
  else if (vt >= 1) text = 'VIP'
  else text = 'VIP'
  
  if (rl > 0) text += rl
  
  // 显示到期时间
  if (expireTime) {
    const date = new Date(expireTime)
    const expired = Date.now() > expireTime
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    text += ` · ${dateStr}${expired ? ' (已过期)' : ''}`
  }
  
  return text
})

const isVipExpired = computed(() => {
  const expireTime = vipInfo.value.expire
  if (!expireTime) return vipInfo.value.type === 0 // 非 VIP 视为已过期
  return Date.now() > expireTime
})

const formatTime = (s: number) => {
  if (!s) return '0:00'
  const min = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

const handleAvatarError = (e: Event) => { (e.target as HTMLImageElement).src = defaultAvatar }
const handleImgError = (e: Event) => { (e.target as HTMLImageElement).src = defaultCover }

const loadDailyRecommend = async () => {
  loading.value = true
  
  try {
    const token = localStorage.getItem('netease_token')
    const res = await fetch(`${API_BASE}/recommend/songs?cookie=${encodeURIComponent(token || '')}`)
    const result = await res.json()
    
    console.log('[Daily Recommend]', result)
    
    if (result.code === 200 && result.data?.dailySongs) {
      dailySongs.value = result.data.dailySongs.map((song: any) => ({
        id: song.id?.toString() || '',
        songname: song.name || '',
        singer: song.ar?.map((a: any) => a.name).join(', ') || '',
        album: song.al?.name || '',
        album_img: song.al?.picUrl || '',
        duration: Math.floor((song.dt || 0) / 1000),
        songid: song.id?.toString() || '',
        privilege: song.privilege || null,
        fee: song.fee || 0,
      }))
    }
  } catch (e) {
    console.error('请求失败:', e)
  }
  
  loading.value = false
}

// 创建音乐信息 - 使用网易云音源
const createMusicInfo = (song: any): LX.Music.MusicInfo => {
  // 默认尝试所有音质让洛雪自动降级
  const _qualitys: Record<string, boolean> = { '128k': true, '320k': true, 'flac': true }
  const priv = song.privilege
  const maxbr = priv?.maxbr || priv?.maxBr || 0
  if (maxbr >= 128000 || !maxbr) _qualitys['128k'] = true
  if (maxbr >= 320000 || (priv?.dlLevel || 0) >= 320000) _qualitys['320k'] = true
  if (maxbr >= 999000 || (priv?.dlLevel || 0) >= 999000) _qualitys['flac'] = true
  if (maxbr >= 1100000) _qualitys['flac24bit'] = true
  
  return {
    id: 'wy_' + song.songid,
    name: song.songname,
    singer: song.singer,
    source: 'wy',
    interval: formatTime(song.duration),
    meta: {
      songId: song.songid,
      albumName: song.album,
      albumId: '',
      picUrl: song.album_img,
      qualitys: Object.keys(_qualitys) as any,
      _qualitys: _qualitys as any,
    }
  }
}

// 播放单首
const playSong = async (index: number) => {
  const targetSong = createMusicInfo(dailySongs.value[index])
  
  if (!assertApiSupport(targetSong.source)) {
    console.error('不支持的音源:', targetSong.source)
    return
  }
  
  const defaultListMusics = await getListMusics(LIST_IDS.DEFAULT)
  await addListMusics(LIST_IDS.DEFAULT, [targetSong])
  
  let targetIndex = defaultListMusics.findIndex(s => s.id === targetSong.id)
  if (targetIndex === -1) {
    // 如果歌曲不在列表中，添加到列表末尾并播放最后一首
    targetIndex = defaultListMusics.length
  }
  playList(LIST_IDS.DEFAULT, targetIndex)
}

// 播放全部
const playAll = async () => {
  if (dailySongs.value.length === 0) return
  
  const songs = dailySongs.value.map(s => createMusicInfo(s))
  
  try {
    await clearListMusics([LIST_IDS.DEFAULT])
    await addListMusics(LIST_IDS.DEFAULT, songs)
  } catch (e: any) {
    console.error('[Netease playAll] error:', e)
    return
  }
  
  playList(LIST_IDS.DEFAULT, 0)
}

// 打开添加对话框（单首）
const openAddDialog = (index: number) => {
  dialogMusicList.value = [createMusicInfo(dailySongs.value[index])]
  showAddDialog.value = true
}

// 打开添加对话框（全部）
const openAddAllDialog = () => {
  if (dailySongs.value.length === 0) return
  dialogMusicList.value = dailySongs.value.map(s => createMusicInfo(s))
  showAddDialog.value = true
}

// 处理添加确认
const handleAddConfirm = () => {
  showAddDialog.value = false
}

// 右键菜单处理
const handleContextMenu = (e: MouseEvent, index: number) => {
  currentSongIndex.value = index
  menuPosition.value = { x: e.clientX, y: e.clientY }
  menuVisible.value = true
}

// 菜单点击处理
const handleMenuClick = (item: any) => {
  if (!item) return
  const idx = currentSongIndex.value
  if (idx < 0 || idx >= dailySongs.value.length) return
  
  switch (item.action) {
    case 'fav':
      openAddDialog(idx)
      break
    case 'search':
      const song = dailySongs.value[idx]
      const keyword = song.songname || ''
      router.push({ path: '/search', query: { text: keyword, source: 'wy', type: 'music' } })
      break
    case 'dislike':
      // 从列表中移除并加载新歌曲
      dailySongs.value.splice(idx, 1)
      // 如果列表少于10首，重新加载推荐
      if (dailySongs.value.length < 10) {
        loadDailyRecommend()
      }
      break
  }
}

// 监听登录成功事件，两步跳转强制刷新组件
const handleLogin = () => {
  location.hash = '#/search'
  setTimeout(() => { location.hash = '#/netease' }, 50)
}
window.addEventListener('netease-login-success', handleLogin)

// 监听登录状态变化
watch(isLoggedIn, (val) => {
  if (val) {
    location.hash = '#/netease'
  }
})

const logout = () => {
  localStorage.removeItem('netease_token')
  localStorage.removeItem('netease_userid')
  localStorage.removeItem('netease_pic')
  localStorage.removeItem('netease_nickname')
  localStorage.removeItem('netease_vip_type')
  localStorage.removeItem('netease_vip_level')
  localStorage.removeItem('netease_red_vip_level')
  localStorage.removeItem('netease_vip_expire')
  vipInfo.value = { type: 0, level: 0, redLevel: 0, expire: 0 }
  dailySongs.value = []
  location.hash = '#/search'
  setTimeout(() => { location.hash = '#/netease' }, 50)
}

onMounted(() => {
  if (isLoggedIn.value) {
    loadDailyRecommend()
    refreshVipInfo()
  }
})

onUnmounted(() => {
  window.removeEventListener('netease-login-success', handleLogin)
})

// 刷新 VIP 信息 - 使用 /vip/info/v2 获取完整信息
const refreshVipInfo = async () => {
  const token = userInfo.value.token
  const userid = userInfo.value.userid
  if (!token || !userid) return

  try {
    const res = await fetch(`http://127.0.0.1:6522/vip/info/v2?uid=${userid}&cookie=${encodeURIComponent(token)}`)
    const data = await res.json()
    if (data.code === 200 && data.data) {
      const info = data.data
      
      // 网易云 VIP 类型判断
      // associator = 黑胶VIP (vipCode=100)
      // musicPackage = 音乐包 (vipCode=230)  
      // redplus = 红钻 (vipCode=300)
      // albumVip = 数字专辑VIP (vipCode=400)
      const associator = info.associator || {}
      const musicPackage = info.musicPackage || {}
      
      // 从 associator 获取黑胶VIP信息
      const expireTime = associator.expireTime || 0
      const vipLevel = associator.vipLevel || 0
      const redVipLevel = info.redVipLevel || 0
      
      // vipType: 0=非VIP, 1=VIP, 2=黑胶, 10=年费黑胶
      let vipType = 0
      if (expireTime && expireTime > Date.now()) {
        // 未过期
        if (vipLevel >= 7) vipType = 2 // 黑胶
        else vipType = 1 // 普通VIP
        // 检查是否年费 (redVipAnnualCount > 0 不太准确，用 expireTime 判断)
        // 简单逻辑：有等级就算
      } else if (expireTime) {
        // 有过期记录，说明曾经是VIP
        vipType = 2 // 保留类型显示，标记为已过期
      }
      
      // 如果 user/detail 里有 vipType，优先使用
      try {
        const detailRes = await fetch(`http://127.0.0.1:6522/user/detail?uid=${userid}&cookie=${encodeURIComponent(token)}`)
        const detailData = await detailRes.json()
        if (detailData.code === 200 && detailData.profile) {
          vipType = detailData.profile.vipType || vipType
        }
      } catch (e) {
        // ignore
      }

      localStorage.setItem('netease_vip_type', String(vipType))
      localStorage.setItem('netease_vip_level', String(vipLevel))
      localStorage.setItem('netease_red_vip_level', String(redVipLevel))
      localStorage.setItem('netease_vip_expire', String(expireTime))
      
      // 更新响应式 ref
      vipInfo.value = { type: vipType, level: vipLevel, redLevel: redVipLevel, expire: expireTime }
    }
  } catch (e) {
    console.error('[Netease Refresh VIP Error]', e)
  }
}
</script>

<style module lang="less">
.page { padding: 15px; height: 100%; overflow-y: auto; box-sizing: border-box; }
.notLogged { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }
.logo { font-size: 48px; margin-bottom: 10px; }
.notLogged h2 { font-size: 20px; margin: 0 0 8px; color: var(--color-font); }
.notLogged p { color: var(--color-font-label); margin: 0 0 15px; }
.loginBtn { padding: 10px 25px; background: var(--color-primary); color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; }
.netease .loginBtn { background: #C20C0C; }
.header { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--color-content-background); border-radius: 8px; margin-bottom: 15px; }
.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.userInfo { flex: 1; min-width: 0; }
.userInfo h3 { margin: 0 0 2px; font-size: 14px; color: var(--color-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.userInfo h3 .vipBadge { margin-left: 8px; padding: 2px 6px; background: #ff4d4f; color: #fff; border-radius: 4px; font-size: 10px; font-weight: bold; }
.userInfo h3 .vipExpired { background: #999; }
.userInfo span { font-size: 11px; color: var(--color-font-label); }
.logoutBtn { padding: 5px 10px; background: var(--color-button-background); border: none; border-radius: 4px; cursor: pointer; color: var(--color-button-font); font-size: 12px; }
.headerActions { display: flex; gap: 6px; flex-shrink: 0; }
.section { background: var(--color-content-background); border-radius: 8px; padding: 10px; }
.sectionHeader { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; flex-wrap: wrap; gap: 8px; }
.sectionHeader h2 { font-size: 15px; margin: 0; color: var(--color-font); }
.btnGroup { display: flex; gap: 8px; flex-wrap: wrap; }
.playAllBtn { padding: 4px 12px; background: var(--color-primary); color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.playAllBtn:disabled { opacity: 0.6; cursor: not-allowed; }
.refreshBtn { padding: 4px 10px; background: var(--color-button-background); color: var(--color-button-font); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.refreshBtn:disabled { opacity: 0.6; cursor: not-allowed; }
.loading { text-align: center; padding: 30px; }
.spinner { width: 24px; height: 24px; border: 2px solid var(--color-primary-border); border-top-color: var(--color-primary); border-radius: 50%; margin: 0 auto; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty { text-align: center; padding: 30px; color: var(--color-font-label); font-size: 13px; }
.songList { display: flex; flex-direction: column; gap: 4px; }
.songItem { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.songItem:hover { background: var(--color-primary-background-hover); }
.songItem:hover .addBtn { opacity: 1; }
.index { width: 20px; font-size: 12px; color: var(--color-font-label); text-align: center; flex-shrink: 0; }
.cover { width: 36px; height: 36px; border-radius: 4px; object-fit: cover; flex-shrink: 0; }
.songInfo { flex: 1; min-width: 0; }
.songName { font-size: 13px; color: var(--color-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.songArtist { font-size: 11px; color: var(--color-font-label); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.duration { font-size: 11px; color: var(--color-font-label); flex-shrink: 0; margin-right: 8px; }
.addBtn { width: 24px; height: 24px; border-radius: 4px; border: none; background: transparent; color: var(--color-font-label); cursor: pointer; font-size: 16px; opacity: 0; transition: opacity 0.2s; flex-shrink: 0; }
.addBtn:hover { color: var(--color-primary); }
</style>
