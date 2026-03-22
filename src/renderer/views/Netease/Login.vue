<template>
  <div :class="$style.loginPage">
    <div :class="$style.container">
      <h2 :class="$style.title">网易云音乐登录</h2>
      
      <div :class="$style.tabs">
        <button :class="[$style.tab, { [$style.active]: loginType === 'phone' }]" @click="loginType = 'phone'">验证码登录</button>
        <button :class="[$style.tab, { [$style.active]: loginType === 'qr' }]" @click="switchToQr">扫码登录</button>
      </div>
      
      <!-- 验证码登录 -->
      <div v-if="loginType === 'phone'" :class="$style.form">
        <input v-model="phoneForm.mobile" placeholder="请输入手机号" :class="$style.input" />
        <div :class="$style.codeRow">
          <input v-model="phoneForm.code" placeholder="请输入验证码" :class="$style.input" />
          <button :class="$style.codeBtn" @click="sendCaptcha" :disabled="countdown > 0 || !phoneForm.mobile || sendingCode">
            {{ sendingCode ? '发送中' : (countdown > 0 ? `${countdown}s` : '获取验证码') }}
          </button>
        </div>
        <button :class="$style.loginBtn" @click="phoneLogin" :disabled="loading">
          {{ loading ? '登录中...' : '立即登录' }}
        </button>
      </div>
      
      <!-- 扫码登录 -->
      <div v-else :class="$style.qrSection">
        <img v-if="qrCode" :src="qrCode" :class="$style.qrCode" />
        <div v-else :class="$style.qrLoading">加载中...</div>
        <p :class="$style.qrTip">{{ qrTip }}</p>
        <button v-if="qrExpired" :class="$style.refreshBtn" @click="getQrCode">刷新二维码</button>
      </div>
      
      <p v-if="errorMsg" :class="$style.error">{{ errorMsg }}</p>
      <p v-if="successMsg" :class="$style.success">{{ successMsg }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const emit = defineEmits(['login-success'])
const API_BASE = 'http://127.0.0.1:6522'

const loginType = ref<'phone' | 'qr'>('phone')
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)
const errorMsg = ref('')
const successMsg = ref('')

const phoneForm = ref({ mobile: '', code: '' })
const qrCode = ref('')
const qrKey = ref('')
const qrTip = ref('请使用网易云音乐APP扫描二维码')
const qrExpired = ref(false)
const checkInterval = ref<number | null>(null)

// 发送验证码 (适配原仓库 API)
const sendCaptcha = async () => {
  if (!phoneForm.value.mobile || countdown.value > 0 || sendingCode.value) return
  
  sendingCode.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/captcha/sent?phone=${phoneForm.value.mobile}`)
    const result = await res.json()
    console.log('[Captcha]', result)
    
    // 原仓库 API 返回 code: 200 表示成功
    if (result.code === 200 || result.data === true) {
      successMsg.value = '验证码已发送'
      countdown.value = 60
      const timer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) clearInterval(timer)
      }, 1000)
    } else {
      errorMsg.value = result.message || result.body?.message || '发送失败'
    }
  } catch (e) {
    console.error('[Captcha Error]', e)
    errorMsg.value = '网络错误，请确保API服务已启动'
  } finally {
    sendingCode.value = false
  }
}

// 手机登录 (适配原仓库 API)
const phoneLogin = async () => {
  if (!phoneForm.value.mobile || !phoneForm.value.code) return
  
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/login/cellphone?phone=${phoneForm.value.mobile}&captcha=${phoneForm.value.code}`)
    const result = await res.json()
    console.log('[Phone Login]', result)

    // API 直接返回 code，不是在 body 中
    if (result.code === 200) {
      const cookie = result.cookie || ''
      const uid = result.account?.id || result.profile?.userId

      // 用 /user/detail 获取完整用户信息（包含 VIP），参考 SPlayer 实现
      let userDetail = result.profile
      try {
        const userRes = await fetch(`${API_BASE}/user/account?cookie=${encodeURIComponent(cookie)}`)
        const userData = await userRes.json()
        console.log('[User Account]', userData)
        if (userData.code === 200 && userData.profile) {
          userDetail = userData.profile
          // 获取用户详情（包含 vipType）
          const detailRes = await fetch(`${API_BASE}/user/detail?uid=${userData.profile.userId}&cookie=${encodeURIComponent(cookie)}`)
          const detailData = await detailRes.json()
          console.log('[User Detail]', detailData)
          if (detailData.code === 200 && detailData.profile) {
            userDetail = { ...userDetail, ...detailData.profile }
          }
        }
      } catch (e) {
        console.error('[Get User Detail Error]', e)
      }

      // 获取 VIP 详细信息 (等级 + 过期时间)
      let redVipLevel = 0
      let vipExpireTime = 0
      try {
        const vipRes = await fetch(`${API_BASE}/vip/info/v2?uid=${uid || userDetail?.userId}&cookie=${encodeURIComponent(cookie)}`)
        const vipData = await vipRes.json()
        console.log('[VIP Info V2]', vipData)
        if (vipData.code === 200 && vipData.data) {
          redVipLevel = vipData.data.redVipLevel || 0
          vipExpireTime = vipData.data.associator?.expireTime || 0
        }
      } catch (e) {
        console.error('[Get VIP Info Error]', e)
      }

      const userData2 = {
        userid: (uid || userDetail?.userId)?.toString() || '',
        nickname: userDetail?.nickname || '',
        avatarUrl: userDetail?.avatarUrl || '',
        token: cookie,
        vipType: userDetail?.vipType || 0,
        vipLevel: userDetail?.vipRights?.associator?.vipLevel || 0,
        redVipLevel,
        vipExpireTime,
      }
      console.log('[Phone Login SaveUserInfo]', JSON.stringify(userData2))
      saveUserInfo(userData2)
      successMsg.value = '登录成功！'
      emit('login-success')
    } else {
      errorMsg.value = result.message || result.msg || '登录失败'
    }
  } catch (e) {
    console.error('[Phone Login Error]', e)
    errorMsg.value = '网络错误'
  }
  loading.value = false
}

// 切换到扫码登录
const switchToQr = () => {
  loginType.value = 'qr'
  getQrCode()
}

// 获取二维码
const getQrCode = async () => {
  errorMsg.value = ''
  qrExpired.value = false
  qrCode.value = ''
  
  try {
    const keyRes = await fetch(`${API_BASE}/login/qr/key`)
    const keyData = await keyRes.json()
    console.log('[QR Key]', keyData)
    
    // 原仓库 API 返回 code: 200
    if (keyData.code === 200 && keyData.data?.unikey) {
      qrKey.value = keyData.data.unikey
      const qrRes = await fetch(`${API_BASE}/login/qr/create?key=${qrKey.value}&qrimg=true`)
      const qrData = await qrRes.json()
      console.log('[QR Create]', qrData)
      
      if (qrData.code === 200 && qrData.data?.qrimg) {
        qrCode.value = qrData.data.qrimg
        checkQrStatus()
      } else {
        errorMsg.value = '生成二维码失败'
      }
    } else {
      errorMsg.value = '获取二维码失败'
    }
  } catch (e) {
    console.error('[QR Error]', e)
    errorMsg.value = '网络错误，请确保API服务已启动'
  }
}

// 检查二维码状态 (适配原仓库 API)
const checkQrStatus = async () => {
  if (checkInterval.value) clearInterval(checkInterval.value)
  
  checkInterval.value = window.setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/login/qr/check?key=${qrKey.value}&timestamp=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      const result = await res.json()
      console.log('[QR Check]', result)
      
      // 原仓库返回直接在 result 中，不是在 result.body
      // 800=过期, 801=等待扫码, 802=待确认, 803=登录成功
      const code = result.code
      
      if (code === 801) {
        qrTip.value = '请使用网易云音乐APP扫描二维码'
      } else if (code === 802) {
        qrTip.value = `用户 ${result.nickname || ''} 已扫码，等待确认...`
      } else if (code === 803) {
        // 登录成功
        clearInterval(checkInterval.value!)
        console.log('[Login Success]', result)
        
        // 扫码登录返回的数据可能不完整，需要调用用户信息接口
        const cookie = result.cookie || ''
        if (cookie) {
          try {
            const userRes = await fetch(`${API_BASE}/user/account?cookie=${encodeURIComponent(cookie)}`)
            const userData = await userRes.json()
            console.log('[User Account]', userData)

            if (userData.code === 200 && userData.profile) {
              let profile = userData.profile

              // 获取用户详情（包含 vipType），参考 SPlayer 实现
              try {
                const detailRes = await fetch(`${API_BASE}/user/detail?uid=${profile.userId}&cookie=${encodeURIComponent(cookie)}`)
                const detailData = await detailRes.json()
                console.log('[User Detail]', detailData)
                if (detailData.code === 200 && detailData.profile) {
                  profile = { ...profile, ...detailData.profile }
                }
              } catch (e) {
                console.error('[Get User Detail Error]', e)
              }

              // 获取 VIP 详细信息 (等级 + 过期时间)
              let redVipLevel = 0
              let vipExpireTime = 0
              try {
                const vipRes = await fetch(`${API_BASE}/vip/info/v2?uid=${profile.userId}&cookie=${encodeURIComponent(cookie)}`)
                const vipData = await vipRes.json()
                console.log('[VIP Info V2]', vipData)
                if (vipData.code === 200 && vipData.data) {
                  redVipLevel = vipData.data.redVipLevel || 0
                  vipExpireTime = vipData.data.associator?.expireTime || 0
                }
              } catch (e) {
                console.error('[Get VIP Info Error]', e)
              }

              saveUserInfo({
                userid: profile.userId?.toString() || '',
                nickname: profile.nickname || '',
                avatarUrl: profile.avatarUrl || '',
                token: cookie,
                vipType: profile.vipType || 0,
                vipLevel: profile.vipRights?.associator?.vipLevel || 0,
                redVipLevel,
                vipExpireTime,
              })
            } else {
              // 如果获取用户信息失败，使用扫码返回的数据
              saveUserInfo({
                userid: (result.userId || result.userid)?.toString() || '',
                nickname: result.nickname || '',
                avatarUrl: result.avatarUrl || '',
                token: cookie,
              })
            }
          } catch (e) {
            console.error('[Get User Info Error]', e)
            // 使用扫码返回的数据
            saveUserInfo({
              userid: (result.userId || result.userid)?.toString() || '',
              nickname: result.nickname || '',
              avatarUrl: result.avatarUrl || '',
              token: cookie,
            })
          }
        } else {
          saveUserInfo({
            userid: (result.userId || result.userid)?.toString() || '',
            nickname: result.nickname || '',
            avatarUrl: result.avatarUrl || '',
            token: result.token || '',
          })
        }
        
        successMsg.value = '登录成功！'
        emit('login-success')
      } else if (code === 800) {
        clearInterval(checkInterval.value!)
        qrExpired.value = true
        qrTip.value = '二维码已过期，请刷新'
      }
    } catch (e) {
      console.error('[QR Check Error]', e)
    }
  }, 1500)
}

// 保存用户信息
const saveUserInfo = (data: any) => {
  const token = data.token || data.userid || ''
  const userid = data.userid || ''
  const nickname = data.nickname || ''
  const pic = data.avatarUrl || data.pic || ''
  const vipType = data.vipType || 0
  const vipLevel = data.vipLevel || 0
  const redVipLevel = data.redVipLevel || 0
  const vipExpireTime = data.vipExpireTime || 0
  
  localStorage.setItem('netease_token', token)
  localStorage.setItem('netease_userid', userid)
  localStorage.setItem('netease_nickname', nickname)
  localStorage.setItem('netease_pic', pic)
  localStorage.setItem('netease_vip_type', String(vipType))
  localStorage.setItem('netease_vip_level', String(vipLevel))
  localStorage.setItem('netease_red_vip_level', String(redVipLevel))
  localStorage.setItem('netease_vip_expire', String(vipExpireTime))
  window.dispatchEvent(new CustomEvent('netease-login-success'))
  
  console.log('[Netease Login] 保存用户信息:', { token, userid, nickname, vipType, vipLevel, redVipLevel, vipExpireTime })
}

onUnmounted(() => {
  if (checkInterval.value) clearInterval(checkInterval.value)
})
</script>

<style module lang="less">
.loginPage { display: flex; align-items: center; justify-content: center; min-height: 100%; padding: 20px; }
.container { width: 100%; max-width: 350px; padding: 25px; background: var(--color-content-background); border-radius: 12px; }
.title { margin-bottom: 20px; font-size: 20px; color: var(--color-font); text-align: center; }
.tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.tab { flex: 1; padding: 10px; background: transparent; border: 1px solid var(--color-primary-border); color: var(--color-font); border-radius: 6px; cursor: pointer; transition: all 0.2s; }
.tab.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.form { display: flex; flex-direction: column; gap: 12px; }
.input { padding: 12px; border: 1px solid var(--color-primary-border); border-radius: 8px; background: var(--color-content-background); color: var(--color-font); font-size: 14px; }
.input:focus { outline: none; border-color: var(--color-primary); }
.input::placeholder { color: var(--color-font-label); }
.codeRow { display: flex; gap: 8px; }
.codeRow .input { flex: 1; }
.codeBtn { padding: 12px 15px; background: var(--color-primary); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; white-space: nowrap; }
.codeBtn:disabled { opacity: 0.6; cursor: not-allowed; }
.loginBtn { padding: 12px; background: var(--color-primary); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; }
.loginBtn:disabled { opacity: 0.6; cursor: not-allowed; }
.qrSection { text-align: center; }
.qrCode { width: 200px; height: 200px; border-radius: 8px; }
.qrLoading { width: 200px; height: 200px; display: flex; align-items: center; justify-content: center; margin: 0 auto; color: var(--color-font-label); }
.qrTip { margin-top: 12px; color: var(--color-font-label); font-size: 13px; }
.refreshBtn { margin-top: 10px; padding: 8px 20px; background: var(--color-primary); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
.error { color: #ff4d4f; margin-top: 12px; font-size: 13px; text-align: center; }
.success { color: #52c41a; margin-top: 12px; font-size: 13px; text-align: center; }
</style>
