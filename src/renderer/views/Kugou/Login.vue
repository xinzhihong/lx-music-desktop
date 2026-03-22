<template>
  <div :class="$style.loginPage">
    <div :class="$style.container">
      <h2 :class="$style.title">酷狗音乐登录</h2>
      
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
const API_BASE = 'http://127.0.0.1:6521'

const loginType = ref<'phone' | 'qr'>('phone')
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)
const errorMsg = ref('')
const successMsg = ref('')

const phoneForm = ref({ mobile: '', code: '' })
const qrCode = ref('')
const qrKey = ref('')
const qrTip = ref('请使用酷狗APP扫描二维码')
const qrExpired = ref(false)
const checkInterval = ref<number | null>(null)

// 发送验证码
const sendCaptcha = async () => {
  if (!phoneForm.value.mobile || countdown.value > 0 || sendingCode.value) return
  
  sendingCode.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/captcha/sent?mobile=${phoneForm.value.mobile}`, { method: 'POST' })
    const data = await res.json()
    if (data.status === 1) {
      successMsg.value = '验证码已发送'
      countdown.value = 60
      const timer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) clearInterval(timer)
      }, 1000)
    } else {
      errorMsg.value = data.data || '发送失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误，请确保API服务已启动'
  } finally {
    sendingCode.value = false
  }
}

// 手机登录
const phoneLogin = async () => {
  if (!phoneForm.value.mobile || !phoneForm.value.code) return
  
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(`${API_BASE}/login/cellphone?mobile=${phoneForm.value.mobile}&code=${phoneForm.value.code}`, { method: 'POST' })
    const data = await res.json()
    if (data.status === 1) {
      saveUserInfo(data.data)
      successMsg.value = '登录成功！'
      emit('login-success')
    } else {
      errorMsg.value = data.data || '登录失败'
    }
  } catch (e) {
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
    if (keyData.status === 1) {
      qrKey.value = keyData.data.qrcode
      const qrRes = await fetch(`${API_BASE}/login/qr/create?key=${qrKey.value}&qrimg=true`)
      const qrData = await qrRes.json()
      if (qrData.code === 200) {
        qrCode.value = qrData.data.base64
        checkQrStatus()
      }
    } else {
      errorMsg.value = '获取二维码失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误，请确保API服务已启动'
  }
}

// 检查二维码状态 (参考 MoeKoe Music 实现)
const checkQrStatus = async () => {
  if (checkInterval.value) clearInterval(checkInterval.value)
  
  checkInterval.value = window.setInterval(async () => {
    try {
      // 添加 timestamp 防止缓存，使用 Cache-Control 头部
      const res = await fetch(`${API_BASE}/login/qr/check?key=${qrKey.value}&timestamp=${Date.now()}`, {
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      const data = await res.json()
      console.log('[QR Check]', data)
      
      // 状态码: 1=等待扫码, 2=已扫码待确认, 4=登录成功, 0=过期
      const status = data.data?.status
      const userData = data.data
      
      if (status === 1) {
        // 等待扫码，保持默认提示
        qrTip.value = '请使用酷狗APP扫描二维码'
      } else if (status === 2) {
        // 已扫描，等待确认
        qrTip.value = `用户 ${userData.nickname || ''} 已扫码，等待确认...`
      } else if (status === 4) {
        // 登录成功
        clearInterval(checkInterval.value!)
        
        // 尝试获取VIP信息
        let vipData = null
        try {
          const vipRes = await fetch(`${API_BASE}/user/vip/detail`)
          vipData = await vipRes.json()
          console.log('[VIP Info]', vipData)
        } catch (e) {
          console.error('[Get VIP Info Error]', e)
        }
        
        saveUserInfo(userData, vipData)
        successMsg.value = '登录成功！'
        emit('login-success')
      } else if (status === 0) {
        // 二维码过期
        clearInterval(checkInterval.value!)
        qrExpired.value = true
        qrTip.value = '二维码已过期，请刷新'
      }
    } catch (e) {
      console.error('[QR Check Error]', e)
      // 不停止轮询，继续检查
    }
  }, 1500)
}

// 保存用户信息 (参考 MoeKoe Music)
const saveUserInfo = (data: any, vipData?: any) => {
  // 二维码登录返回的数据结构
  const token = data.token || data.userid || ''
  const userid = data.userid || ''
  const nickname = data.nickname || ''
  const pic = data.pic || data.head_pic || ''
  const isVip = vipData?.data?.is_vip || 0
  const vipLevel = vipData?.data?.vip_level || 0
  const vipType = data.vip_type || vipData?.data?.vip_type || 0
  const vipToken = data.vip_token || ''

  localStorage.setItem('kugou_token', token)
  localStorage.setItem('kugou_userid', userid)
  localStorage.setItem('kugou_nickname', nickname)
  localStorage.setItem('kugou_pic', pic)
  localStorage.setItem('kugou_vip', String(isVip))
  localStorage.setItem('kugou_vip_level', String(vipLevel))
  localStorage.setItem('kugou_vip_type', String(vipType))
  localStorage.setItem('kugou_vip_token', vipToken)
  
  // 通知推荐页面 token 已更新
  window.dispatchEvent(new CustomEvent('kugou-login-success'))
  
  console.log('[Login] 保存用户信息:', { token, userid, nickname, isVip, vipLevel, vipType })
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
