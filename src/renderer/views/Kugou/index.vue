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
          <h3>{{ userInfo.nickname || '酷狗用户' }}<span v-if="vipDisplayText" :class="[$style.vipBadge, { [$style.vipExpired]: isVipExpired }]">{{ vipDisplayText }}</span></h3>
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
          <p>点击刷新获取每日推荐</p>
        </div>
        
        <!-- 歌曲列表 -->
        <div v-else :class="$style.songList">
          <div 
            v-for="(song, idx) in dailySongs" 
            :key="song.hash || idx" 
            :class="$style.songItem"
            @click="playSong(idx)"
            @contextmenu.prevent="handleContextMenu($event, idx)"
          >
            <span :class="$style.index">{{ idx + 1 }}</span>
            <img :src="getCover(song)" :class="$style.cover" @error="handleImgError" />
            <div :class="$style.songInfo">
              <div :class="$style.songName">{{ song.ori_audio_name || song.filename || '未知' }}</div>
              <div :class="$style.songArtist">{{ song.author_name || '未知' }}</div>
            </div>
            <span :class="$style.duration">{{ formatTime(song.time_length) }}</span>
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
const API_BASE = 'http://127.0.0.1:6521'

const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iI2ZmNjMyOCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTUlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjE2IiBmaWxsPSJ3aGl0ZSI+4p2kPC90ZXh0Pjwvc3ZnPg=='
const defaultCover = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNmNWY1ZjUiLz48dGV4dCB4PSI1MCUiIHk9IjU1JSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1zaXplPSIxNiIgZmlsbD0iI2NjYyI+4p2kPC90ZXh0Pjwvc3ZnPg=='

const loading = ref(false)
const dailySongs = ref<any[]>([])
const showAddDialog = ref(false)
const dialogMusicList = ref<any[]>([])
const vipDetail = ref<any>(null)


// VIP 信息用 ref 存储（确保响应式更新）
const vipInfo = ref({
  type: parseInt(localStorage.getItem('kugou_vip_type') || '0'),
  level: parseInt(localStorage.getItem('kugou_vip_level') || '0'),
  expire: parseInt(localStorage.getItem('kugou_vip_expire') || '0'),
  fetched: localStorage.getItem('kugou_vip_fetched') === '1',
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
  token: localStorage.getItem('kugou_token') || '',
  userid: localStorage.getItem('kugou_userid') || '',
  pic: localStorage.getItem('kugou_pic') || '',
  nickname: localStorage.getItem('kugou_nickname') || '',
  isVip: vipInfo.value.type > 0 ? 1 : 0,
  vipType: vipInfo.value.type,
  vipLevel: vipInfo.value.level,
}))

const isLoggedIn = computed(() => !!userInfo.value.token)

// VIP 显示相关
const vipDisplayText = computed(() => {
  const vt = vipInfo.value.type
  const vl = vipInfo.value.level

  // 没有任何 VIP 信息则不显示
  if (!vt && !vl && !vipInfo.value.fetched) return ''

  // 判断是否过期
  const expireTime = vipInfo.value.expire
  const expired = vt === 0 || (expireTime && Date.now() > expireTime * 1000)

  // 构建文本
  let text = ''
  if (vl > 0) text = `VIP${vl}`
  else if (vt >= 2) text = '豪华VIP'
  else if (vt >= 1) text = 'VIP'
  else if (vipInfo.value.fetched) text = 'VIP'

  // 显示到期时间
  if (expireTime) {
    const date = new Date(expireTime * 1000)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    text += ` · ${dateStr}`
  }

  // 标记已过期
  if (expired && text) text += ' (已过期)'

  return text
})

const isVipExpired = computed(() => {
  // 当前不是 VIP 就视为已过期
  if (vipInfo.value.type === 0 && vipInfo.value.level === 0) return true
  const expireTime = vipInfo.value.expire
  if (!expireTime) return true // 有VIP记录但没有过期时间，也视为已过期
  return Date.now() / 1000 > expireTime
})

const formatTime = (s: number) => {
  if (!s) return '0:00'
  const min = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

const getCover = (s: any) => s.sizable_cover?.replace('{size}', '150') || s.cover || defaultCover

const handleAvatarError = (e: Event) => { (e.target as HTMLImageElement).src = defaultAvatar }
const handleImgError = (e: Event) => { (e.target as HTMLImageElement).src = defaultCover }

const loadDailyRecommend = async () => {
  loading.value = true
  
  try {
    const res = await fetch(`${API_BASE}/everyday/recommend`)
    const data = await res.json()
    
    if (data.status === 1 && data.data?.song_list) {
      dailySongs.value = data.data.song_list
    }
  } catch (e) {
    console.error('请求失败:', e)
  }
  
  loading.value = false
}

// 创建音乐信息
const createMusicInfo = (song: any): LX.Music.MusicInfo_kg => {
  const name = song.ori_audio_name || song.filename || ''
  const artist = song.author_name || ''
  const hash = song.hash || ''
  const songmid = song.songid?.toString() || song.mixsongid?.toString() || hash || ''
  const albumId = song.album_id?.toString() || song.album_audio_id?.toString() || ''
  const timeLength = song.time_length || 0
  
  // 从歌曲数据中推断音质，默认尝试所有音质让洛雪自动降级
  const _qualitys: Record<string, boolean> = { '128k': true, '320k': true, 'flac': true }
  if (song.filesize_128 > 0 || song.bitrate >= 128) _qualitys['128k'] = true
  if (song.filesize_320 > 0 || song.bitrate >= 320) _qualitys['320k'] = true
  if (song.filesize_flac > 0 || (song.filesize > 0 && song.bitrate >= 900)) _qualitys['flac'] = true
  if (song.filesize_high > 0 || song.filesize_hires > 0 || song.filesize_super > 0) _qualitys['flac24bit'] = true
  
  return {
    id: songmid + '_' + hash,
    name: name,
    singer: artist,
    source: 'kg',
    interval: timeLength ? `${Math.floor(timeLength / 60)}:${(timeLength % 60).toString().padStart(2, '0')}` : null,
    meta: {
      songId: songmid,
      albumName: song.album_name || '',
      albumId: albumId,
      picUrl: getCover(song),
      hash: hash,
      qualitys: Object.keys(_qualitys) as any,
      _qualitys: _qualitys as any,
    }
  }
}

let checkTimer: number | null = null

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
  if (targetIndex > -1) playList(LIST_IDS.DEFAULT, targetIndex)
}

// 播放全部
const playAll = async () => {
  if (dailySongs.value.length === 0) return
  
  const songs = dailySongs.value.map(s => createMusicInfo(s))
  
  try {
    // 清空默认列表，确保只有推荐歌曲
    await clearListMusics([LIST_IDS.DEFAULT])
    // 添加推荐歌曲
    await addListMusics(LIST_IDS.DEFAULT, songs)
  } catch (e: any) {
    console.error('[Kugou playAll] error:', e)
    return
  }
  
  // 直接播放列表第0首（不经过 playSong 避免重复添加）
  // 直接播放列表第0首
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
      const keyword = song.ori_audio_name || song.filename || ''
      router.push({ path: '/search', query: { text: keyword, source: 'kg', type: 'music' } })
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

// 监听登录状态变化，自动跳转
watch(isLoggedIn, (val) => {
  if (val) {
    location.hash = '#/kugou'
  }
}
)

// 监听登录成功事件，两步跳转强制刷新组件
const handleLogin = () => {
  location.hash = '#/search'
  setTimeout(() => { location.hash = '#/kugou' }, 50)
}
window.addEventListener('kugou-login-success', handleLogin)

checkTimer = window.setInterval(() => {
  // 检测酷狗 API 是否存活
}, 30000)

const logout = () => {
  localStorage.removeItem('kugou_token')
  localStorage.removeItem('kugou_userid')
  localStorage.removeItem('kugou_pic')
  localStorage.removeItem('kugou_nickname')
  localStorage.removeItem('kugou_vip')
  localStorage.removeItem('kugou_vip_level')
  localStorage.removeItem('kugou_vip_type')
  localStorage.removeItem('kugou_vip_token')
  localStorage.removeItem('kugou_vip_expire')
  localStorage.removeItem('kugou_vip_fetched')
  vipInfo.value = { type: 0, level: 0, expire: 0, fetched: false }
  dailySongs.value = []
  location.hash = '#/search'
  setTimeout(() => { location.hash = '#/kugou' }, 50)
}

// VIP 信息用 ref 存储（确保响应式更新）// 刷新 VIP 信息
const refreshVipInfo = async () => {
  const token = userInfo.value.token
  const userid = userInfo.value.userid
  if (!token || !userid) return

  const vipToken = localStorage.getItem('kugou_vip_token') || ''
  const vipType = localStorage.getItem('kugou_vip_type') || '0'

  // 构建 cookie 字符串
  const cookieStr = `token=${token}; userid=${userid}; vip_token=${vipToken}; vip_type=${vipType}`

  // 同时用 Cookie header 和 URL 参数两种方式传递
  const headers: Record<string, string> = { 'Cookie': cookieStr }
  const cookieParam = encodeURIComponent(cookieStr)

  // 先尝试 user_detail 接口获取用户基本信息（包含 VIP 等级）
  try {
    const detailRes = await fetch(`${API_BASE}/user/detail?cookie=${cookieParam}&userid=${userid}`, { headers })
    const detailData = await detailRes.json()
    console.log('[Kugou User Detail]', JSON.stringify(detailData).slice(0, 1000))

    if (detailData.status === 1 && detailData.data) {
      const info = detailData.data
      // user_detail 返回的数据中可能包含 VIP 信息
      if (info.vip_type !== undefined) vipInfo.value.type = info.vip_type
      if (info.vip_level !== undefined) vipInfo.value.level = info.vip_level
      if (info.vip_lv !== undefined) vipInfo.value.level = info.vip_lv
      if (info.expire_time) vipInfo.value.expire = info.expire_time
      
      // 从不同字段名尝试获取
      const userVip = info.user_vip || info.vip || info.vipinfo || info.vip_info || {}
      if (userVip.vip_type !== undefined) vipInfo.value.type = userVip.vip_type
      if (userVip.vip_level !== undefined) vipInfo.value.level = userVip.vip_level
      if (userVip.vip_lv !== undefined) vipInfo.value.level = userVip.vip_lv
      if (userVip.expire_time) vipInfo.value.expire = userVip.expire_time
      
      console.log('[Kugou User Detail] VIP:', vipInfo.value.type, vipInfo.value.level, vipInfo.value.expire)
      
      // 如果已经获取到 VIP 信息，直接更新 localStorage 并返回
      if (vipInfo.value.type > 0 || vipInfo.value.level > 0 || vipInfo.value.expire > 0) {
        localStorage.setItem('kugou_vip_type', String(vipInfo.value.type))
        localStorage.setItem('kugou_vip_level', String(vipInfo.value.level))
        localStorage.setItem('kugou_vip_expire', String(vipInfo.value.expire))
        localStorage.setItem('kugou_vip', vipInfo.value.type > 0 ? '1' : '0')
        localStorage.setItem('kugou_vip_fetched', '1')
        vipInfo.value.fetched = true
        return
      }
    }
  } catch (e) {
    console.error('[Kugou User Detail Error]', e)
  }

  try {
    const res = await fetch(`${API_BASE}/youth/union/vip?cookie=${cookieParam}`, { headers })
    const data = await res.json()
    console.log('[Kugou VIP Union]', JSON.stringify(data).slice(0, 800))

    if (data.status === 1 && data.data) {
      const info = data.data
      let newVipType = 0
      let newVipLevel = 0
      let expireTime = 0

      const svipInfo = info.svip || info.SVIP
      const dvipInfo = info.dvip || info.DVIP
      const qvipInfo = info.qvip || info.QVIP

      if (svipInfo) {
        newVipType = 2
        newVipLevel = svipInfo.associator?.vip_level || svipInfo.vip_level || 0
        expireTime = svipInfo.expire_time || svipInfo.end_time || 0
      } else if (dvipInfo) {
        newVipType = 1
        newVipLevel = dvipInfo.associator?.vip_level || dvipInfo.vip_level || 0
        expireTime = dvipInfo.expire_time || dvipInfo.end_time || 0
      } else if (qvipInfo) {
        newVipType = 1
        newVipLevel = qvipInfo.associator?.vip_level || qvipInfo.vip_level || 0
        expireTime = qvipInfo.expire_time || qvipInfo.end_time || 0
      }

      if (!newVipType) {
        newVipType = info.vip_type || info.type || 0
        newVipLevel = info.vip_level || info.level || 0
        expireTime = info.expire_time || info.end_time || 0
      }

      // 即使当前不是 VIP（newVipType=0），如果有数据就保存，显示已过期
      localStorage.setItem('kugou_vip_type', String(newVipType))
      localStorage.setItem('kugou_vip_level', String(newVipLevel))
      localStorage.setItem('kugou_vip', newVipType > 0 ? '1' : '0')
      if (expireTime) localStorage.setItem('kugou_vip_expire', String(expireTime))
      localStorage.setItem('kugou_vip_fetched', '1')

      // 更新响应式 ref
      vipInfo.value = { type: newVipType, level: newVipLevel, expire: expireTime, fetched: true }

      vipDetail.value = data.data
      console.log('[Kugou VIP] Updated:', { newVipType, newVipLevel, expireTime })
      return
    } else {
      // API 返回失败（可能用户没登录或 cookie 无效），但仍标记已尝试
      console.log('[Kugou VIP] API returned:', data.status, data.error_code, data.data?.errmsg)
      localStorage.setItem('kugou_vip_fetched', '1')
      vipInfo.value.fetched = true
    }
  } catch (e) {
    console.error('[Kugou VIP Info Error]', e)
  }
  
  // 备用：user/vip/detail
  try {
    const res2 = await fetch(`${API_BASE}/user/vip/detail?cookie=${cookieParam}`, { headers })
    const data2 = await res2.json()
    console.log('[Kugou VIP Detail]', JSON.stringify(data2).slice(0, 800))

    if (data2.status === 1 && data2.data) {
      const info = data2.data
      const t = info.vip_type || 0
      const l = info.vip_level || 0
      const e = info.expire_time || 0
      localStorage.setItem('kugou_vip_type', String(t))
      localStorage.setItem('kugou_vip_level', String(l))
      localStorage.setItem('kugou_vip', String(info.is_vip || 0))
      if (e) localStorage.setItem('kugou_vip_expire', String(e))
      localStorage.setItem('kugou_vip_fetched', '1')
      vipInfo.value = { type: t, level: l, expire: e, fetched: true }
      vipDetail.value = data2.data
    }
  } catch (e2) {
    console.error('[Kugou VIP Detail Error]', e2)
  }
  
  // 所有接口都没获取到 VIP 信息，也标记已尝试
  if (!vipInfo.value.fetched) {
    vipInfo.value.fetched = true
    localStorage.setItem('kugou_vip_fetched', '1')
  }
}

onMounted(() => {
  if (isLoggedIn.value) {
    loadDailyRecommend()
    refreshVipInfo()
  }
})

onUnmounted(() => {
  if (checkTimer != null) window.clearInterval(checkTimer)
})
</script>

<style module lang="less">
.page { padding: 15px; height: 100%; overflow-y: auto; box-sizing: border-box; }
.notLogged { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }
.logo { font-size: 48px; margin-bottom: 10px; }
.notLogged h2 { font-size: 20px; margin: 0 0 8px; color: var(--color-font); }
.notLogged p { color: var(--color-font-label); margin: 0 0 15px; }
.loginBtn { padding: 10px 25px; background: var(--color-primary); color: #fff; text-decoration: none; border-radius: 6px; font-size: 14px; }
.kugou .loginBtn { background: #2CA2F9; }
.header { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--color-content-background); border-radius: 8px; margin-bottom: 15px; }
.avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.userInfo { flex: 1; min-width: 0; }
.userInfo h3 { margin: 0 0 2px; font-size: 14px; color: var(--color-font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.userInfo h3 .vipBadge { margin-left: 8px; padding: 2px 6px; background: #ff4d4f; color: #fff; border-radius: 4px; font-size: 10px; font-weight: bold; }
.userInfo h3 .vipExpired { background: #999; }
.userInfo span { font-size: 11px; color: var(--color-font-label); }
.logoutBtn { padding: 5px 10px; background: var(--color-button-background); border: none; border-radius: 4px; cursor: pointer; color: var(--color-button-font); font-size: 12px; }
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
