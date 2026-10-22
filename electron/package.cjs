// Đóng gói bản tải về cho Windows: release/Lang Que Yen Binh-win32-x64/ (chạy sau `npm run build`).
const path = require('path');
const { packager } = require('@electron/packager');

const root = path.join(__dirname, '..');
// Chỉ mang theo bản build web và phần Electron; mã nguồn, ảnh quảng cáo, node_modules để lại.
const keep = /^\/(dist|electron|package\.json)(\/|$)/;

packager({
  dir: root,
  out: path.join(root, 'release'),
  name: 'Lang Que Yen Binh',
  executableName: 'LangQueYenBinh',
  platform: 'win32',
  arch: 'x64',
  icon: path.join(__dirname, 'icon.ico'),
  overwrite: true,
  prune: false,
  ignore: (p) => p !== '' && !keep.test(p),
  win32metadata: { ProductName: 'Làng Quê Yên Bình', FileDescription: 'Làng Quê Yên Bình' },
}).then((dirs) => console.log('Đã đóng gói:', dirs.join(', ')));
