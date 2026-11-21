import 'dotenv/config';
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
  appUrl: string;
  spotifyClientId: string;
  spotifyClientSecret: string;
  appVersionName: string;
  appVersionCodeMobile: number;
  appVersionCodeTv: number;
  appVersionCodeMusic: number;
  androidMobilePkg: string;
  androidTvPkg: string;
  androidMusicPkg: string;
  legacyAndroidPkg: string;
  androidCertSha256: string;
  belixXtreamServer: string;
  belixXtreamUser: string;
  belixXtreamPass: string;
}

const isProdEnv = process.env.NODE_ENV === 'production';
const parsedEnvPort = Number(process.env.PORT);

export const ENV: AppEnvironmentConfig = {
  port: isProdEnv
    ? parsedEnvPort || 3000
    : parsedEnvPort && parsedEnvPort !== 8080
      ? parsedEnvPort
      : 3000,
  nodeEnv:
    isProdEnv
      ? 'production'
      : process.env.NODE_ENV === 'test'
        ? 'test'
        : 'development',
  isProd: isProdEnv,
  tmdbApiKey: process.env.TMDB_API_KEY || '90b2cae8d7161e8ba0f3836240d7d352',
  publicDomain: process.env.PUBLIC_APP_DOMAIN || '',
  appUrl: (process.env.APP_URL || '').replace(/\/+$/, ''),
  spotifyClientId: (process.env.SPOTIFY_CLIENT_ID || '').trim(),
  spotifyClientSecret: (process.env.SPOTIFY_CLIENT_SECRET || '').trim(),
  appVersionName: process.env.NAIM_APP_VERSION || '3.2.0',
  appVersionCodeMobile: Number(process.env.NAIM_MOBILE_VERSION_CODE) || 302,
  appVersionCodeTv: Number(process.env.NAIM_TV_VERSION_CODE) || 302,
  appVersionCodeMusic: Number(process.env.NAIM_MUSIC_VERSION_CODE) || 302,
  androidMobilePkg: process.env.ANDROID_MOBILE_PKG || 'com.naimcine.mobile',
  androidTvPkg: process.env.ANDROID_TV_PKG || 'com.naimcine.tv',
  androidMusicPkg: process.env.ANDROID_MUSIC_PKG || 'com.riffan.music',
  legacyAndroidPkg: 'studio.ai.naimcine.app',
  androidCertSha256:
    process.env.ANDROID_SHA256_FINGERPRINT ||
    '70:B5:CB:FA:3D:E2:D3:D3:84:DD:04:93:15:5F:33:39:48:FC:47:B6:AB:E1:DD:13:B9:A8:75:58:29:23:96:30',
  belixXtreamServer: process.env.BELIX_XTREAM_SERVER || '',
  belixXtreamUser: process.env.BELIX_XTREAM_USER || '',
  belixXtreamPass: process.env.BELIX_XTREAM_PASS || '',
};
