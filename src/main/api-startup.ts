// API 启动管理
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { app } from 'electron';

let kugouApiProcess: ReturnType<typeof spawn> | null = null;
let neteaseApiProcess: ReturnType<typeof spawn> | null = null;

// 检查端口是否被占用
const checkPort = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: any) => {
      resolve(err.code !== 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
};

// 酷狗 API 启动
const startKugouApi = async () => {
  const KUGOU_PORT = 6521;
  
  try {
    const isPortAvailable = await checkPort(KUGOU_PORT);
    if (!isPortAvailable) {
      console.error(`[KuGou API] 端口 ${KUGOU_PORT} 已被占用`);
      return;
    }
    
    const apiPath = app.isPackaged
      ? path.join(process.resourcesPath, 'kugou-api')
      : path.join(__dirname, '../../../KuGouMusicApi');
    
    const exeName = process.platform === 'darwin'
      ? (process.arch === 'arm64' ? 'app_macos_arm64' : 'app_macos')
      : (process.platform === 'win32' ? 'app.exe' : 'app_linux')

    const apiEntry = path.join(apiPath, exeName);

    console.log('[KuGou API] 启动中...');
    console.log('[KuGou API] 路径:', apiEntry);

    if (!fs.existsSync(apiEntry)) {
      console.error('[KuGou API] 可执行文件不存在:', apiEntry);
      return;
    }
    
    kugouApiProcess = spawn(apiEntry, [`--port=${KUGOU_PORT}`], {
      cwd: apiPath,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    kugouApiProcess.stdout?.on('data', (data) => {
      console.log('[KuGou API]', data.toString().trim());
    });
    
    kugouApiProcess.stderr?.on('data', (data) => {
      console.error('[KuGou API Error]', data.toString().trim());
    });
    
    kugouApiProcess.on('close', (code) => {
      console.log('[KuGou API] 进程关闭，退出码:', code);
      kugouApiProcess = null;
    });
    
  } catch (error) {
    console.error('[KuGou API] 启动失败:', error);
  }
};

// 网易云 API 启动 - 使用 pkg 编译的可执行文件
const startNeteaseApi = async () => {
  const NETEASE_PORT = 6522;
  
  try {
    const isPortAvailable = await checkPort(NETEASE_PORT);
    if (!isPortAvailable) {
      console.error(`[Netease API] 端口 ${NETEASE_PORT} 已被占用`);
      return;
    }
    
    const apiPath = app.isPackaged
      ? path.join(process.resourcesPath, 'netease-api')
      : path.join(__dirname, '../../../netease-api');
    
    const exeName = process.platform === 'darwin' 
      ? (process.arch === 'arm64' ? 'app_macos_arm64' : 'app_macos')
      : (process.platform === 'win32' ? 'app.exe' : 'app');
    
    const apiEntry = path.join(apiPath, exeName);
    
    console.log('[Netease API] 启动中...');
    console.log('[Netease API] 路径:', apiEntry);
    
    if (!fs.existsSync(apiEntry)) {
      console.error('[Netease API] 可执行文件不存在:', apiEntry);
      // 回退到开发模式使用 node 运行
      const appJsPath = path.join(apiPath, 'app.js');
      if (fs.existsSync(appJsPath)) {
        console.log('[Netease API] 使用开发模式启动 (node app.js)');
        neteaseApiProcess = spawn('node', [appJsPath], {
          cwd: apiPath,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PORT: String(NETEASE_PORT) }
        });
      }
      return;
    }
    
    // 使用可执行文件启动
    neteaseApiProcess = spawn(apiEntry, [], {
      cwd: apiPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { 
        ...process.env, 
        PORT: String(NETEASE_PORT)
      }
    });
    
    neteaseApiProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log('[Netease API]', output);
      if (output.includes('running')) {
        console.log(`[Netease API] 服务已启动 @ port ${NETEASE_PORT}`);
      }
    });
    
    neteaseApiProcess.stderr?.on('data', (data) => {
      console.error('[Netease API Error]', data.toString().trim());
    });
    
    neteaseApiProcess.on('error', (error) => {
      console.error('[Netease API] 进程错误:', error);
    });
    
    neteaseApiProcess.on('close', (code) => {
      console.log('[Netease API] 进程关闭，退出码:', code);
      neteaseApiProcess = null;
    });
    
  } catch (error) {
    console.error('[Netease API] 启动失败:', error);
  }
};

// 应用启动时启动 API
app.whenReady().then(() => {
  console.log('[API] 开始启动 API 服务...');
  startKugouApi();
  startNeteaseApi();
});

// 应用退出时停止 API
app.on('before-quit', () => {
  console.log('[API] 停止 API 服务...');
  if (kugouApiProcess) {
    try {
      kugouApiProcess.kill('SIGTERM');
    } catch (e) {
      console.error('[KuGou API] 停止失败:', e);
    }
    kugouApiProcess = null;
  }
  if (neteaseApiProcess) {
    try {
      neteaseApiProcess.kill('SIGTERM');
    } catch (e) {
      console.error('[Netease API] 停止失败:', e);
    }
    neteaseApiProcess = null;
  }
});
