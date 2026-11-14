import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '../..');

export interface AppEnvironmentConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  isProd: boolean;
  tmdbApiKey: string;
  publicDomain: string;
  appVersionName: string;
  appVersionCodeMobile: number;
  appVersionCodeTv: number;
  androidMobilePkg: string;
  androidTvPkg: string;
  legacyAndroidPkg: string;
  androidCertSha256: string;
}

export const ENV: AppEnvironmentConfig = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv:
    process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development',
  isProd: process.env.NODE_ENV === 'production',
  tmdbApiKey: process.env.TMDB_API_KEY || '90b2cae8d7161e8ba0f3836240d7d352',
  publicDomain: process.env.PUBLIC_APP_DOMAIN || '',
  appVersionName: process.env.NAIM_APP_VERSION || '2.4.0',
  appVersionCodeMobile: Number(process.env.NAIM_MOBILE_VERSION_CODE) || 240,
  appVersionCodeTv: Number(process.env.NAIM_TV_VERSION_CODE) || 240,
  androidMobilePkg: process.env.ANDROID_MOBILE_PKG || 'com.naimcine.mobile',
  androidTvPkg: process.env.ANDROID_TV_PKG || 'com.naimcine.tv',
  legacyAndroidPkg: 'studio.ai.naimcine.app',
  androidCertSha256:
    process.env.ANDROID_SHA256_FINGERPRINT ||
    '70:B5:CB:FA:3D:E2:D3:D3:84:DD:04:93:15:5F:33:39:48:FC:47:B6:AB:E1:DD:13:B9:A8:75:58:29:23:96:30',
};
