export interface EarthLocation {
  id: string;
  name: string;
  english: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
  description: string;
  color: string;
}

export const locations: EarthLocation[] = [
  {
    id: 'shanghai',
    name: '上海',
    english: 'SHANGHAI',
    country: '中国 · 亚洲',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    description: '江海交汇处，千万盏灯火，\n汇成这颗星球上温柔的脉搏。',
    color: '#a6c7da',
  },
  {
    id: 'tokyo',
    name: '东京',
    english: 'TOKYO',
    country: '日本 · 亚洲',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
    description: '从富士山的远影到东京湾，\n日出之地，永远有新的故事。',
    color: '#c7b3a1',
  },
  {
    id: 'new-york',
    name: '纽约',
    english: 'NEW YORK',
    country: '美国 · 北美洲',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
    description: '大西洋的风掠过曼哈顿，\n不眠的灯火，照亮另一种生活。',
    color: '#c7b887',
  },
  {
    id: 'paris',
    name: '巴黎',
    english: 'PARIS',
    country: '法国 · 欧洲',
    latitude: 48.8566,
    longitude: 2.3522,
    timezone: 'Europe/Paris',
    description: '塞纳河缓缓穿过光之城，\n让日常，也成为值得凝望的风景。',
    color: '#aab7ad',
  },
  {
    id: 'sydney',
    name: '悉尼',
    english: 'SYDNEY',
    country: '澳大利亚 · 大洋洲',
    latitude: -33.8688,
    longitude: 151.2093,
    timezone: 'Australia/Sydney',
    description: '南半球的海岸与蔚蓝港湾，\n在世界的另一边，迎接第一束光。',
    color: '#8dbaaf',
  },
];

export function formatCoordinate(value: number, latitude = true) {
  return `${Math.abs(value).toFixed(2)}° ${latitude ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W'}`;
}
