// Редактор узла (нижний лист): создание и изменение.
import {
  h, api, refreshState, section, row, inputRow, selectRow, segmentedRow, switchRow,
  textArea, openSheet, toast, alertError, toInt,
} from '../core.js';

const PROTOCOLS = [
  ['vless', 'VLESS'], ['vmess', 'VMess'], ['trojan', 'Trojan'],
  ['shadowsocks', 'Shadowsocks'], ['socks', 'SOCKS'], ['http', 'HTTP'],
];
const NETWORKS = [['tcp', 'TCP'], ['ws', 'WebSocket'], ['grpc', 'gRPC'], ['xhttp', 'XHTTP'], ['httpupgrade', 'HTTPUpgrade']];
const FLOWS = [['', 'нет'], ['xtls-rprx-vision', 'xtls-rprx-vision']];
const FINGERPRINTS = [['', 'не задан'], ['chrome', 'chrome'], ['firefox', 'firefox'], ['safari', 'safari'],
  ['ios', 'ios'], ['edge', 'edge'], ['random', 'random'], ['randomized', 'randomized']];
const METHODS = [
  ['aes-128-gcm', 'aes-128-gcm'], ['aes-256-gcm', 'aes-256-gcm'],
  ['chacha20-ietf-poly1305', 'chacha20-ietf-poly1305'],
  ['2022-blake3-aes-128-gcm', '2022-blake3-aes-128-gcm'],
  ['2022-blake3-aes-256-gcm', '2022-blake3-aes-256-gcm'],
  ['none', 'none'],
];
const XHTTP_MODES = [['', 'авто'], ['auto', 'auto'], ['packet-up', 'packet-up'], ['stream-up', 'stream-up'], ['stream-one', 'stream-one']];

const EMPTY = {
  name: '', enabled: true, note: '', protocol: 'vless', address: '', port: 443,
  uuid: '', flow: '', encryption: 'none', alterId: 0,
  password: '', method: 'aes-256-gcm', username: '',
  network: 'tcp', security: 'reality',
  sni: '', fingerprint: 'chrome', alpn: '', allowInsecure: false,
  publicKey: '', shortId: '', spiderX: '',
  path: '', host: '', serviceName: '', mode: '', raw: null,
};

function show(el, visible) { if (el) el.classList.toggle('hidden', !visible); }

/**
 * openNodeEditor(node|null, onSaved)
 */
export function openNodeEditor(node, onSaved) {
  const src = Object.assign({}, EMPTY, node || {});
  const isNew = !node || !node.id;

  const nameR = inputRow('Название', src.name, { placeholder: 'Мой сервер' });
  const protoR = selectRow('Протокол', src.protocol, PROTOCOLS, () => sync());
  const addrR = inputRow('Адрес', src.address, { placeholder: 'example.com или 1.2.3.4' });
  const portR = inputRow('Порт', src.port, { type: 'number', inputmode: 'numeric' });

  const uuidR = inputRow('UUID', src.uuid, { placeholder: '00000000-0000-…', mono: true });
  const flowR = selectRow('Flow', src.flow || '', FLOWS);
  const alterIdR = inputRow('alterId', src.alterId || 0, { type: 'number', inputmode: 'numeric' });
  const passR = inputRow('Пароль', src.password, { placeholder: 'пароль' });
  const methodR = selectRow('Шифрование', src.method || 'aes-256-gcm', METHODS);
  const userR = inputRow('Пользователь', src.username, { placeholder: 'не задан' });

  const netR = selectRow('Транспорт', src.network || 'tcp', NETWORKS, () => sync());
  const pathR = inputRow('Путь', src.path, { placeholder: '/ws', mono: true });
  const hostR = inputRow('Host', src.host, { placeholder: 'example.com' });
  const svcR = inputRow('serviceName', src.serviceName, { placeholder: 'grpc', mono: true });
  const modeR = selectRow('Режим', src.mode || '', XHTTP_MODES);

  const secR = segmentedRow('Безопасность', src.security || 'none', [
    ['none', 'Нет'], ['tls', 'TLS'], ['reality', 'Reality'],
  ], () => sync());
  const sniR = inputRow('SNI', src.sni, { placeholder: 'www.microsoft.com' });
  const fpR = selectRow('Отпечаток', src.fingerprint || '', FINGERPRINTS);
  const alpnR = inputRow('ALPN', src.alpn, { placeholder: 'h2,http/1.1', mono: true });
  const insecureR = switchRow('Разрешить самоподписанный', !!src.allowInsecure, null);
  const pubR = inputRow('publicKey', src.publicKey, { placeholder: 'Reality public key', mono: true });
  const sidR = inputRow('shortId', src.shortId, { placeholder: '0123abcd', mono: true });
  const spxR = inputRow('spiderX', src.spiderX, { placeholder: '/', mono: true });

  const noteR = inputRow('Заметка', src.note, { placeholder: 'не задана' });
  const enabledR = switchRow('Включен', src.enabled !== false, null);

  const rawTa = textArea(src.raw ? JSON.stringify(src.raw, null, 2) : '', '{\n  "protocol": "vless",\n  …\n}', 8);
  const rawWrap = h('div.card.hidden', rawTa);
  const rawToggle = row({
    icon: 'doc', color: 'var(--gray)', title: 'Продвинутый: JSON outbound',
    value: src.raw ? 'задан' : 'нет', chevron: true,
    onClick: () => {
      const open = rawWrap.classList.contains('hidden');
      rawWrap.classList.toggle('hidden', !open);
      if (open) setTimeout(() => rawTa.focus(), 60);
    },
  });

  function sync() {
    const p = protoR.getValue();
    const net = netR.getValue();
    const sec = secR.getValue();

    show(uuidR, p === 'vless' || p === 'vmess');
    show(flowR, p === 'vless');
    show(alterIdR, p === 'vmess');
    show(passR, p === 'trojan' || p === 'shadowsocks' || p === 'socks' || p === 'http');
    show(methodR, p === 'shadowsocks');
    show(userR, p === 'socks' || p === 'http');

    show(pathR, net === 'ws' || net === 'httpupgrade' || net === 'xhttp');
    show(hostR, net === 'ws' || net === 'httpupgrade' || net === 'xhttp');
    show(svcR, net === 'grpc');
    show(modeR, net === 'xhttp');

    show(sniR, sec !== 'none');
    show(fpR, sec !== 'none');
    show(alpnR, sec === 'tls');
    show(insecureR, sec === 'tls');
    show(pubR, sec === 'reality');
    show(sidR, sec === 'reality');
    show(spxR, sec === 'reality');
  }

  function collect() {
    const p = protoR.getValue();
    const net = netR.getValue();
    const sec = secR.getValue();
    const out = Object.assign({}, node || {}, {
      name: nameR.getValue(),
      enabled: enabledR.getValue(),
      note: noteR.getValue(),
      protocol: p,
      address: addrR.getValue(),
      port: toInt(portR.getValue(), 0),
      uuid: (p === 'vless' || p === 'vmess') ? uuidR.getValue() : '',
      flow: p === 'vless' ? flowR.getValue() : '',
      encryption: src.encryption || 'none',
      alterId: p === 'vmess' ? toInt(alterIdR.getValue(), 0) : 0,
      password: (p === 'trojan' || p === 'shadowsocks' || p === 'socks' || p === 'http') ? passR.getValue() : '',
      method: p === 'shadowsocks' ? methodR.getValue() : '',
      username: (p === 'socks' || p === 'http') ? userR.getValue() : '',
      network: net,
      security: sec,
      sni: sec !== 'none' ? sniR.getValue() : '',
      fingerprint: sec !== 'none' ? fpR.getValue() : '',
      alpn: sec === 'tls' ? alpnR.getValue() : '',
      allowInsecure: sec === 'tls' ? insecureR.getValue() : false,
      publicKey: sec === 'reality' ? pubR.getValue() : '',
      shortId: sec === 'reality' ? sidR.getValue() : '',
      spiderX: sec === 'reality' ? spxR.getValue() : '',
      path: (net === 'ws' || net === 'httpupgrade' || net === 'xhttp') ? pathR.getValue() : '',
      host: (net === 'ws' || net === 'httpupgrade' || net === 'xhttp') ? hostR.getValue() : '',
      serviceName: net === 'grpc' ? svcR.getValue() : '',
      mode: net === 'xhttp' ? modeR.getValue() : '',
      raw: null,
    });
    const rawText = rawTa.value.trim();
    if (rawText) {
      let parsed;
      try { parsed = JSON.parse(rawText); } catch (e) {
        throw new Error('JSON outbound: ' + ((e && e.message) || 'ошибка разбора'));
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON outbound должен быть объектом');
      }
      out.raw = parsed;
    }
    return out;
  }

  openSheet({
    title: isNew ? 'Новый узел' : 'Изменить узел',
    doneText: 'Сохранить',
    build(body) {
      body.appendChild(section('Основное', [nameR, protoR, addrR, portR]));
      body.appendChild(section('Параметры', [uuidR, flowR, alterIdR, passR, methodR, userR]));
      body.appendChild(section('Транспорт', [netR, pathR, hostR, svcR, modeR]));
      body.appendChild(section('Безопасность', [secR, sniR, fpR, alpnR, insecureR, pubR, sidR, spxR],
        'Если Reality-узел не подключается, попробуйте сменить отпечаток (chrome ↔ firefox).'));
      body.appendChild(section('Прочее', [noteR, enabledR]));
      const adv = h('div.section', h('div.card', rawToggle), rawWrap,
        h('div.section-foot', { text: 'Если задан JSON outbound, остальные поля игнорируются. Пустое поле — выключено.' }));
      body.appendChild(adv);
      sync();
    },
    async onDone(ctl) {
      let payload;
      try { payload = collect(); } catch (e) { toast(e.message, 'err'); return; }
      if (!payload.name) { toast('Введите название', 'err'); return; }
      if (!payload.raw) {
        if (!payload.address) { toast('Введите адрес', 'err'); return; }
        if (payload.port < 1 || payload.port > 65535) { toast('Некорректный порт', 'err'); return; }
      }
      ctl.setBusy(true);
      try {
        const saved = isNew
          ? await api('POST', '/api/nodes', payload)
          : await api('PUT', '/api/nodes/' + encodeURIComponent(node.id), payload);
        await refreshState();
        ctl.close(true);
        toast(isNew ? 'Узел добавлен' : 'Применено');
        if (onSaved) onSaved(saved);
      } catch (e) {
        ctl.setBusy(false);
        alertError(e, isNew ? 'Не удалось добавить узел' : 'Не удалось сохранить');
      }
    },
  });
}
