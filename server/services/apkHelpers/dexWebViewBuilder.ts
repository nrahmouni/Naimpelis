import crypto from 'crypto';
import { adler32, pad4, writeUleb128 } from './androidBinaryXmlAndArsc.ts';

interface MethodRefSpec {
  cls: string;
  name: string;
  ret: string;
  params: string[];
}

export function buildWebViewMainActivityDex(launchUrl: string): Buffer {
  const MAIN_CLS = 'Lcom/naimcine/app/MainActivity;';
  const SUPER_CLS = 'Landroid/app/Activity;';
  const CHROME_CLS = 'Lcom/naimcine/app/NaimWebChromeClient;';
  const CHROME_SUPER_CLS = 'Landroid/webkit/WebChromeClient;';
  const PERM_REQ_CLS = 'Landroid/webkit/PermissionRequest;';
  const STR_ARR_CLS = '[Ljava/lang/String;';

  const methodSpecs: MethodRefSpec[] = [
    { cls: SUPER_CLS, name: '<init>', ret: 'V', params: [] },
    { cls: SUPER_CLS, name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
    { cls: SUPER_CLS, name: 'getWindow', ret: 'Landroid/view/Window;', params: [] },
    { cls: SUPER_CLS, name: 'setContentView', ret: 'V', params: ['Landroid/view/View;'] },
    { cls: SUPER_CLS, name: 'checkSelfPermission', ret: 'I', params: ['Ljava/lang/String;'] },
    { cls: SUPER_CLS, name: 'requestPermissions', ret: 'V', params: [STR_ARR_CLS, 'I'] },
    { cls: SUPER_CLS, name: 'onBackPressed', ret: 'V', params: [] },
    { cls: 'Landroid/view/Window;', name: 'setStatusBarColor', ret: 'V', params: ['I'] },
    { cls: 'Landroid/view/Window;', name: 'setNavigationBarColor', ret: 'V', params: ['I'] },
    { cls: 'Landroid/webkit/WebView;', name: '<init>', ret: 'V', params: ['Landroid/content/Context;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setBackgroundColor', ret: 'V', params: ['I'] },
    { cls: 'Landroid/webkit/WebView;', name: 'getSettings', ret: 'Landroid/webkit/WebSettings;', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebViewClient', ret: 'V', params: ['Landroid/webkit/WebViewClient;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'setWebChromeClient', ret: 'V', params: [CHROME_SUPER_CLS] },
    { cls: 'Landroid/webkit/WebView;', name: 'loadUrl', ret: 'V', params: ['Ljava/lang/String;'] },
    { cls: 'Landroid/webkit/WebView;', name: 'canGoBack', ret: 'Z', params: [] },
    { cls: 'Landroid/webkit/WebView;', name: 'goBack', ret: 'V', params: [] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setJavaScriptEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDomStorageEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setDatabaseEnabled', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setUseWideViewPort', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setLoadWithOverviewMode', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setMediaPlaybackRequiresUserGesture', ret: 'V', params: ['Z'] },
    { cls: 'Landroid/webkit/WebSettings;', name: 'setMixedContentMode', ret: 'V', params: ['I'] },
    { cls: 'Landroid/webkit/WebViewClient;', name: '<init>', ret: 'V', params: [] },
    { cls: CHROME_SUPER_CLS, name: '<init>', ret: 'V', params: [] },
    { cls: PERM_REQ_CLS, name: 'getResources', ret: STR_ARR_CLS, params: [] },
    { cls: PERM_REQ_CLS, name: 'grant', ret: 'V', params: [STR_ARR_CLS] },
    { cls: CHROME_CLS, name: '<init>', ret: 'V', params: [] },
    { cls: CHROME_CLS, name: 'onPermissionRequest', ret: 'V', params: [PERM_REQ_CLS] },
    { cls: MAIN_CLS, name: '<init>', ret: 'V', params: [] },
    { cls: MAIN_CLS, name: 'onBackPressed', ret: 'V', params: [] },
    { cls: MAIN_CLS, name: 'onCreate', ret: 'V', params: ['Landroid/os/Bundle;'] },
  ];

  const fieldSpecs = [
    { cls: MAIN_CLS, type: 'Landroid/webkit/WebView;', name: 'webView' },
  ];

  const typeSet = new Set<string>([MAIN_CLS, SUPER_CLS, CHROME_CLS, CHROME_SUPER_CLS, STR_ARR_CLS]);
  const stringSet = new Set<string>([launchUrl, 'android.permission.RECORD_AUDIO']);

  const protoShorty = (ret: string, params: string[]) => {
    const ch = (t: string) => (t.length === 1 ? t : 'L');
    return ch(ret) + params.map(ch).join('');
  };

  for (const f of fieldSpecs) {
    typeSet.add(f.cls);
    typeSet.add(f.type);
    stringSet.add(f.cls);
    stringSet.add(f.type);
    stringSet.add(f.name);
  }

  for (const m of methodSpecs) {
    typeSet.add(m.cls);
    typeSet.add(m.ret);
    stringSet.add(m.cls);
    stringSet.add(m.ret);
    stringSet.add(m.name);
    stringSet.add(protoShorty(m.ret, m.params));
    for (const p of m.params) {
      typeSet.add(p);
      stringSet.add(p);
    }
  }
  typeSet.forEach((t) => stringSet.add(t));

  const strings = Array.from(stringSet).sort((a, b) =>
    Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
  );
  const strIdx = new Map<string, number>();
  strings.forEach((s, i) => strIdx.set(s, i));

  const types = Array.from(typeSet).sort((a, b) => strIdx.get(a)! - strIdx.get(b)!);
  const typeIdx = new Map<string, number>();
  types.forEach((t, i) => typeIdx.set(t, i));

  const protoMap = new Map<string, { shorty: string; ret: string; params: string[] }>();
  for (const m of methodSpecs) {
    const key = `${m.ret}(${m.params.join(',')})`;
    if (!protoMap.has(key)) {
      protoMap.set(key, { shorty: protoShorty(m.ret, m.params), ret: m.ret, params: m.params });
    }
  }
  const protos = Array.from(protoMap.entries())
    .sort(([, a], [, b]) => {
      const rDiff = typeIdx.get(a.ret)! - typeIdx.get(b.ret)!;
      if (rDiff !== 0) return rDiff;
      const minLen = Math.min(a.params.length, b.params.length);
      for (let i = 0; i < minLen; i++) {
        const pDiff = typeIdx.get(a.params[i])! - typeIdx.get(b.params[i])!;
        if (pDiff !== 0) return pDiff;
      }
      return a.params.length - b.params.length;
    })
    .map(([key, val]) => ({ key, ...val }));
  const protoIdx = new Map<string, number>();
  protos.forEach((p, i) => protoIdx.set(p.key, i));

  const methods = [...methodSpecs].sort((a, b) => {
    const cDiff = typeIdx.get(a.cls)! - typeIdx.get(b.cls)!;
    if (cDiff !== 0) return cDiff;
    const nDiff = strIdx.get(a.name)! - strIdx.get(b.name)!;
    if (nDiff !== 0) return nDiff;
    const pa = protoIdx.get(`${a.ret}(${a.params.join(',')})`)!;
    const pb = protoIdx.get(`${b.ret}(${b.params.join(',')})`)!;
    return pa - pb;
  });
  const mId = (cls: string, name: string, ret: string, params: string[] = []): number => {
    const pKey = `${ret}(${params.join(',')})`;
    const found = methods.findIndex(
      (m) => m.cls === cls && m.name === name && `${m.ret}(${m.params.join(',')})` === pKey
    );
    if (found < 0) throw new Error(`Missing DEX method ${cls}.${name}${pKey}`);
    return found;
  };

  const emitU16 = (arr: number[], val: number) => {
    arr.push(val & 0xffff);
  };
  const invoke35c = (arr: number[], opcode: number, methodIndex: number, regs: number[]) => {
    const count = regs.length;
    const reg4 = regs[4] ?? 0;
    emitU16(arr, (opcode & 0xff) | (count << 12) | (reg4 << 8));
    emitU16(arr, methodIndex);
    const r0 = regs[0] ?? 0;
    const r1 = regs[1] ?? 0;
    const r2 = regs[2] ?? 0;
    const r3 = regs[3] ?? 0;
    emitU16(arr, r0 | (r1 << 4) | (r2 << 8) | (r3 << 12));
  };

  // Method 1: MainActivity.<init>()V
  const initInsns: number[] = [];
  invoke35c(initInsns, 0x70, mId(SUPER_CLS, '<init>', 'V'), [0]);
  emitU16(initInsns, 0x000e);

  // Method 2: MainActivity.onCreate(Bundle)V
  const onCreateInsns: number[] = [];
  invoke35c(onCreateInsns, 0x6f, mId(SUPER_CLS, 'onCreate', 'V', ['Landroid/os/Bundle;']), [4, 5]);
  emitU16(onCreateInsns, 0x0022);
  emitU16(onCreateInsns, typeIdx.get('Landroid/webkit/WebView;')!);
  invoke35c(onCreateInsns, 0x70, mId('Landroid/webkit/WebView;', '<init>', 'V', ['Landroid/content/Context;']), [0, 4]);
  // Store WebView instance into this.webView (field@0): iput-object v0, v4, field@0
  emitU16(onCreateInsns, 0x405b);
  emitU16(onCreateInsns, 0x0000);
  emitU16(onCreateInsns, 0x0114);
  emitU16(onCreateInsns, 0x0000);
  emitU16(onCreateInsns, 0xff00);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'setBackgroundColor', 'V', ['I']), [0, 1]);
  invoke35c(onCreateInsns, 0x6e, mId(SUPER_CLS, 'getWindow', 'Landroid/view/Window;'), [4]);
  emitU16(onCreateInsns, 0x020c);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/view/Window;', 'setStatusBarColor', 'V', ['I']), [2, 1]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/view/Window;', 'setNavigationBarColor', 'V', ['I']), [2, 1]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'getSettings', 'Landroid/webkit/WebSettings;'), [0]);
  emitU16(onCreateInsns, 0x020c);
  emitU16(onCreateInsns, 0x1312);
  emitU16(onCreateInsns, 0x0112);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setJavaScriptEnabled', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setDomStorageEnabled', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setDatabaseEnabled', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setUseWideViewPort', 'V', ['Z']), [2, 3]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setLoadWithOverviewMode', 'V', ['Z']), [2, 1]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setMediaPlaybackRequiresUserGesture', 'V', ['Z']), [2, 1]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebSettings;', 'setMixedContentMode', 'V', ['I']), [2, 1]);
  emitU16(onCreateInsns, 0x0222);
  emitU16(onCreateInsns, typeIdx.get('Landroid/webkit/WebViewClient;')!);
  invoke35c(onCreateInsns, 0x70, mId('Landroid/webkit/WebViewClient;', '<init>', 'V'), [2]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'setWebViewClient', 'V', ['Landroid/webkit/WebViewClient;']), [0, 2]);
  emitU16(onCreateInsns, 0x0222);
  emitU16(onCreateInsns, typeIdx.get(CHROME_CLS)!);
  invoke35c(onCreateInsns, 0x70, mId(CHROME_CLS, '<init>', 'V'), [2]);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'setWebChromeClient', 'V', [CHROME_SUPER_CLS]), [0, 2]);
  emitU16(onCreateInsns, 0x021a);
  emitU16(onCreateInsns, strIdx.get(launchUrl)!);
  invoke35c(onCreateInsns, 0x6e, mId('Landroid/webkit/WebView;', 'loadUrl', 'V', ['Ljava/lang/String;']), [0, 2]);
  invoke35c(onCreateInsns, 0x6e, mId(SUPER_CLS, 'setContentView', 'V', ['Landroid/view/View;']), [4, 0]);
  emitU16(onCreateInsns, 0x011a);
  emitU16(onCreateInsns, strIdx.get('android.permission.RECORD_AUDIO')!);
  invoke35c(onCreateInsns, 0x6e, mId(SUPER_CLS, 'checkSelfPermission', 'I', ['Ljava/lang/String;']), [4, 1]);
  emitU16(onCreateInsns, 0x000a);
  const ifGrantedIdx = onCreateInsns.length;
  emitU16(onCreateInsns, 0x0038);
  emitU16(onCreateInsns, 0);
  emitU16(onCreateInsns, 0x1012);
  emitU16(onCreateInsns, 0x0212);
  emitU16(onCreateInsns, 0x0323);
  emitU16(onCreateInsns, typeIdx.get(STR_ARR_CLS)!);
  emitU16(onCreateInsns, 0x014d);
  emitU16(onCreateInsns, 0x0203);
  emitU16(onCreateInsns, 0x0013);
  emitU16(onCreateInsns, 101);
  invoke35c(onCreateInsns, 0x6e, mId(SUPER_CLS, 'requestPermissions', 'V', [STR_ARR_CLS, 'I']), [4, 3, 0]);
  const grantedTargetIdx = onCreateInsns.length;
  onCreateInsns[ifGrantedIdx + 1] = (grantedTargetIdx - ifGrantedIdx) & 0xffff;
  emitU16(onCreateInsns, 0x000e);

  // Method 3: NaimWebChromeClient.<init>()V
  const chromeInitInsns: number[] = [];
  invoke35c(chromeInitInsns, 0x70, mId(CHROME_SUPER_CLS, '<init>', 'V'), [0]);
  emitU16(chromeInitInsns, 0x000e);

  // Method 4: NaimWebChromeClient.onPermissionRequest(PermissionRequest)V
  const chromePermInsns: number[] = [];
  const ifNullReqIdx = chromePermInsns.length;
  emitU16(chromePermInsns, 0x0238);
  emitU16(chromePermInsns, 0);
  invoke35c(chromePermInsns, 0x6e, mId(PERM_REQ_CLS, 'getResources', STR_ARR_CLS), [2]);
  emitU16(chromePermInsns, 0x000c);
  const ifNullResIdx = chromePermInsns.length;
  emitU16(chromePermInsns, 0x0038);
  emitU16(chromePermInsns, 0);
  invoke35c(chromePermInsns, 0x6e, mId(PERM_REQ_CLS, 'grant', 'V', [STR_ARR_CLS]), [2, 0]);
  const permRetIdx = chromePermInsns.length;
  chromePermInsns[ifNullReqIdx + 1] = (permRetIdx - ifNullReqIdx) & 0xffff;
  chromePermInsns[ifNullResIdx + 1] = (permRetIdx - ifNullResIdx) & 0xffff;
  emitU16(chromePermInsns, 0x000e);

  // Method 5: MainActivity.onBackPressed()V (WebView.canGoBack() ? goBack() : super.onBackPressed())
  // Registers: v0 (WebView), v1 (boolean canGoBack), v2 (this)
  const onBackPressedInsns: number[] = [];
  // iget-object v0, v2, field@0 -> 0x2054, 0x0000
  emitU16(onBackPressedInsns, 0x2054);
  emitU16(onBackPressedInsns, 0x0000);
  const ifNullWvIdx = onBackPressedInsns.length;
  emitU16(onBackPressedInsns, 0x0038); // if-eqz v0, +superTarget
  emitU16(onBackPressedInsns, 0);
  invoke35c(onBackPressedInsns, 0x6e, mId('Landroid/webkit/WebView;', 'canGoBack', 'Z'), [0]);
  emitU16(onBackPressedInsns, 0x010a); // move-result v1
  const ifCannotGoBackIdx = onBackPressedInsns.length;
  emitU16(onBackPressedInsns, 0x0138); // if-eqz v1, +superTarget
  emitU16(onBackPressedInsns, 0);
  invoke35c(onBackPressedInsns, 0x6e, mId('Landroid/webkit/WebView;', 'goBack', 'V'), [0]);
  emitU16(onBackPressedInsns, 0x000e); // return-void
  const superBackTargetIdx = onBackPressedInsns.length;
  onBackPressedInsns[ifNullWvIdx + 1] = (superBackTargetIdx - ifNullWvIdx) & 0xffff;
  onBackPressedInsns[ifCannotGoBackIdx + 1] = (superBackTargetIdx - ifCannotGoBackIdx) & 0xffff;
  invoke35c(onBackPressedInsns, 0x6f, mId(SUPER_CLS, 'onBackPressed', 'V'), [2]);
  emitU16(onBackPressedInsns, 0x000e); // return-void

  const makeCodeItem = (regs: number, ins: number, outs: number, insns: number[]): Buffer => {
    const b = Buffer.alloc(16 + insns.length * 2);
    b.writeUInt16LE(regs, 0);
    b.writeUInt16LE(ins, 2);
    b.writeUInt16LE(outs, 4);
    b.writeUInt16LE(0, 6);
    b.writeUInt32LE(0, 8);
    b.writeUInt32LE(insns.length, 12);
    insns.forEach((u, i) => b.writeUInt16LE(u, 16 + i * 2));
    return pad4(b);
  };

  const initCodeItem = makeCodeItem(1, 1, 1, initInsns);
  const onCreateCodeItem = makeCodeItem(6, 2, 3, onCreateInsns);
  const onBackPressedCodeItem = makeCodeItem(3, 1, 1, onBackPressedInsns);
  const chromeInitCodeItem = makeCodeItem(1, 1, 1, chromeInitInsns);
  const chromePermCodeItem = makeCodeItem(3, 2, 2, chromePermInsns);

  const HEADER_SIZE = 0x70;
  const stringIdsOff = HEADER_SIZE;
  const stringIdsSize = strings.length * 4;
  const typeIdsOff = stringIdsOff + stringIdsSize;
  const typeIdsSize = types.length * 4;
  const protoIdsOff = typeIdsOff + typeIdsSize;
  const protoIdsSize = protos.length * 12;
  const fieldIdsOff = protoIdsOff + protoIdsSize;
  const fieldIdsSize = fieldSpecs.length * 8;
  const methodIdsOff = fieldIdsOff + fieldIdsSize;
  const methodIdsSize = methods.length * 8;
  const classDefsOff = methodIdsOff + methodIdsSize;
  const classDefsSize = 64;

  let cursor = classDefsOff + classDefsSize;

  const protoParamListOff = new Map<string, number>();
  const dataChunks: Buffer[] = [];
  const pushDataAligned4 = (buf: Buffer): number => {
    const off = cursor;
    const padded = pad4(buf);
    dataChunks.push(padded);
    cursor += padded.length;
    return off;
  };
  const pushDataRaw = (buf: Buffer): number => {
    const off = cursor;
    dataChunks.push(buf);
    cursor += buf.length;
    return off;
  };

  for (const p of protos) {
    if (p.params.length === 0) {
      protoParamListOff.set(p.key, 0);
      continue;
    }
    const tl = Buffer.alloc(4 + p.params.length * 2);
    tl.writeUInt32LE(p.params.length, 0);
    p.params.forEach((pt, idx) => tl.writeUInt16LE(typeIdx.get(pt)!, 4 + idx * 2));
    protoParamListOff.set(p.key, pushDataAligned4(tl));
  }

  const initCodeOff = pushDataAligned4(initCodeItem);
  const onCreateCodeOff = pushDataAligned4(onCreateCodeItem);
  const onBackPressedCodeOff = pushDataAligned4(onBackPressedCodeItem);
  const chromeInitCodeOff = pushDataAligned4(chromeInitCodeItem);
  const chromePermCodeOff = pushDataAligned4(chromePermCodeItem);

  const stringDataOffsets: number[] = [];
  for (const s of strings) {
    const utf8 = Buffer.from(s, 'utf8');
    const item = Buffer.concat([writeUleb128(s.length), utf8, Buffer.from([0x00])]);
    stringDataOffsets.push(pushDataRaw(item));
  }

  const mInitIdx = mId(MAIN_CLS, '<init>', 'V');
  const mOnCreateIdx = mId(MAIN_CLS, 'onCreate', 'V', ['Landroid/os/Bundle;']);
  const mOnBackPressedIdx = mId(MAIN_CLS, 'onBackPressed', 'V');
  const mChromeInitIdx = mId(CHROME_CLS, '<init>', 'V');
  const mChromePermIdx = mId(CHROME_CLS, 'onPermissionRequest', 'V', [PERM_REQ_CLS]);

  // Virtual methods MUST be strictly sorted by method_idx in class_data_item
  const mainVirtualMethods = [
    { idx: mOnCreateIdx, flags: 0x0004, off: onCreateCodeOff },
    { idx: mOnBackPressedIdx, flags: 0x0001, off: onBackPressedCodeOff },
  ].sort((a, b) => a.idx - b.idx);

  const mainClassDataFixed = Buffer.concat([
    writeUleb128(0), // static_fields_size
    writeUleb128(fieldSpecs.length), // instance_fields_size
    writeUleb128(1), // direct_methods_size
    writeUleb128(mainVirtualMethods.length), // virtual_methods_size
    // instance field 0: private WebView webView
    writeUleb128(0),
    writeUleb128(0x0002),
    // direct method: <init>
    writeUleb128(mInitIdx),
    writeUleb128(0x10001),
    writeUleb128(initCodeOff),
    // virtual method 0
    writeUleb128(mainVirtualMethods[0].idx),
    writeUleb128(mainVirtualMethods[0].flags),
    writeUleb128(mainVirtualMethods[0].off),
    // virtual method 1 (delta-encoded)
    writeUleb128(mainVirtualMethods[1].idx - mainVirtualMethods[0].idx),
    writeUleb128(mainVirtualMethods[1].flags),
    writeUleb128(mainVirtualMethods[1].off),
  ]);
  const mainClassDataOff = pushDataRaw(mainClassDataFixed);

  const chromeClassDataFixed = Buffer.concat([
    writeUleb128(0),
    writeUleb128(0),
    writeUleb128(1),
    writeUleb128(1),
    writeUleb128(mChromeInitIdx),
    writeUleb128(0x10001),
    writeUleb128(chromeInitCodeOff),
    writeUleb128(mChromePermIdx),
    writeUleb128(0x0001),
    writeUleb128(chromePermCodeOff),
  ]);
  const chromeClassDataOff = pushDataRaw(chromeClassDataFixed);

  const preMapRem = cursor % 4;
  if (preMapRem !== 0) {
    const pad = Buffer.alloc(4 - preMapRem, 0);
    dataChunks.push(pad);
    cursor += pad.length;
  }

  const mapOff = cursor;
  const mapItems: { type: number; size: number; off: number }[] = [
    { type: 0x0000, size: 1, off: 0 },
    { type: 0x0001, size: strings.length, off: stringIdsOff },
    { type: 0x0002, size: types.length, off: typeIdsOff },
    { type: 0x0003, size: protos.length, off: protoIdsOff },
    { type: 0x0004, size: fieldSpecs.length, off: fieldIdsOff },
    { type: 0x0005, size: methods.length, off: methodIdsOff },
    { type: 0x0006, size: 2, off: classDefsOff },
    {
      type: 0x1001,
      size: Array.from(protoParamListOff.values()).filter((v) => v > 0).length,
      off: Array.from(protoParamListOff.values()).find((v) => v > 0) || 0,
    },
    { type: 0x2000, size: 2, off: mainClassDataOff },
    { type: 0x2001, size: 5, off: initCodeOff },
    { type: 0x2002, size: strings.length, off: stringDataOffsets[0] },
    { type: 0x1000, size: 1, off: mapOff },
  ]
    .filter((it) => it.size > 0)
    .sort((a, b) => a.off - b.off);

  const mapBuf = Buffer.alloc(4 + mapItems.length * 12);
  mapBuf.writeUInt32LE(mapItems.length, 0);
  mapItems.forEach((it, idx) => {
    const o = 4 + idx * 12;
    mapBuf.writeUInt16LE(it.type, o);
    mapBuf.writeUInt16LE(0, o + 2);
    mapBuf.writeUInt32LE(it.size, o + 4);
    mapBuf.writeUInt32LE(it.off, o + 8);
  });
  dataChunks.push(mapBuf);
  cursor += mapBuf.length;

  const fileSize = cursor;
  const dataOff = classDefsOff + classDefsSize;
  const dataSize = fileSize - dataOff;

  const dex = Buffer.alloc(fileSize);

  Buffer.from('dex\n035\0', 'ascii').copy(dex, 0);
  dex.writeUInt32LE(fileSize, 32);
  dex.writeUInt32LE(HEADER_SIZE, 36);
  dex.writeUInt32LE(0x12345678, 40);
  dex.writeUInt32LE(0, 44);
  dex.writeUInt32LE(0, 48);
  dex.writeUInt32LE(mapOff, 52);
  dex.writeUInt32LE(strings.length, 56);
  dex.writeUInt32LE(stringIdsOff, 60);
  dex.writeUInt32LE(types.length, 64);
  dex.writeUInt32LE(typeIdsOff, 68);
  dex.writeUInt32LE(protos.length, 72);
  dex.writeUInt32LE(protoIdsOff, 76);
  dex.writeUInt32LE(fieldSpecs.length, 80);
  dex.writeUInt32LE(fieldIdsOff, 84);
  dex.writeUInt32LE(methods.length, 88);
  dex.writeUInt32LE(methodIdsOff, 92);
  dex.writeUInt32LE(2, 96);
  dex.writeUInt32LE(classDefsOff, 100);
  dex.writeUInt32LE(dataSize, 104);
  dex.writeUInt32LE(dataOff, 108);

  stringDataOffsets.forEach((off, i) => dex.writeUInt32LE(off, stringIdsOff + i * 4));
  types.forEach((t, i) => dex.writeUInt32LE(strIdx.get(t)!, typeIdsOff + i * 4));
  protos.forEach((p, i) => {
    const o = protoIdsOff + i * 12;
    dex.writeUInt32LE(strIdx.get(p.shorty)!, o);
    dex.writeUInt32LE(typeIdx.get(p.ret)!, o + 4);
    dex.writeUInt32LE(protoParamListOff.get(p.key) || 0, o + 8);
  });
  fieldSpecs.forEach((f, i) => {
    const o = fieldIdsOff + i * 8;
    dex.writeUInt16LE(typeIdx.get(f.cls)!, o);
    dex.writeUInt16LE(typeIdx.get(f.type)!, o + 2);
    dex.writeUInt32LE(strIdx.get(f.name)!, o + 4);
  });
  methods.forEach((m, i) => {
    const o = methodIdsOff + i * 8;
    dex.writeUInt16LE(typeIdx.get(m.cls)!, o);
    dex.writeUInt16LE(protoIdx.get(`${m.ret}(${m.params.join(',')})`)!, o + 2);
    dex.writeUInt32LE(strIdx.get(m.name)!, o + 4);
  });

  dex.writeUInt32LE(typeIdx.get(MAIN_CLS)!, classDefsOff);
  dex.writeUInt32LE(0x0001, classDefsOff + 4);
  dex.writeUInt32LE(typeIdx.get(SUPER_CLS)!, classDefsOff + 8);
  dex.writeUInt32LE(0, classDefsOff + 12);
  dex.writeUInt32LE(0xffffffff, classDefsOff + 16);
  dex.writeUInt32LE(0, classDefsOff + 20);
  dex.writeUInt32LE(mainClassDataOff, classDefsOff + 24);
  dex.writeUInt32LE(0, classDefsOff + 28);

  const cDef1 = classDefsOff + 32;
  dex.writeUInt32LE(typeIdx.get(CHROME_CLS)!, cDef1);
  dex.writeUInt32LE(0x0001, cDef1 + 4);
  dex.writeUInt32LE(typeIdx.get(CHROME_SUPER_CLS)!, cDef1 + 8);
  dex.writeUInt32LE(0, cDef1 + 12);
  dex.writeUInt32LE(0xffffffff, cDef1 + 16);
  dex.writeUInt32LE(0, cDef1 + 20);
  dex.writeUInt32LE(chromeClassDataOff, cDef1 + 24);
  dex.writeUInt32LE(0, cDef1 + 28);

  Buffer.concat(dataChunks).copy(dex, dataOff);

  const sha1 = crypto.createHash('sha1').update(dex.subarray(32)).digest();
  sha1.copy(dex, 12);
  dex.writeUInt32LE(adler32(dex.subarray(12)), 8);

  return dex;
}
