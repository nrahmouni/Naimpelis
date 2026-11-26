/**
 * @module server/routes/vpnGatewayRoutes
 * @description API routes for cross-device Spain VPN / Egress Proxy management,
 * live Urban VPN gateway catalog/probes, .ovpn template downloads, and direct
 * verification of Spanish broadcasters (Antena 3, laSexta, Atresplayer).
 */

import type { Express } from 'express';
import {
  clearRuntimeSpainProxyConfig,
  getSpainGatewayOverview,
  getSpainGatewayPublicConfig,
  probeGeoExitInfo,
  setRuntimeSpainProxyConfig,
  validateSpainProxyUrl,
  verifySpanishChannelsDirectAccess,
  type SpainProxyScope,
} from '../services/spainVpnGatewayService.ts';
import {
  getUrbanVpnOvpnProfile,
  listUrbanVpnGateways,
  probeAllSpainUrbanGateways,
  probeUrbanVpnGateway,
  syncLiveUrbanVpnCatalog,
} from '../services/urbanVpnService.ts';

export function registerVpnGatewayRoutes(app: Express): void {
  app.get('/api/vpn/overview', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const overview = await getSpainGatewayOverview();
      res.json({ success: true, ...overview });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Error consultando el estado VPN España',
      });
    }
  });

  app.get('/api/vpn/status', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      config: getSpainGatewayPublicConfig(),
    });
  });

  app.get('/api/vpn/gateways', (req, res) => {
    const query = String(req.query.q || '').trim();
    const spainOnly = req.query.spainOnly === '1' || req.query.spainOnly === 'true';
    const gateways = listUrbanVpnGateways({ query, spainOnly });
    res.json({ success: true, total: gateways.length, gateways });
  });

  app.post('/api/vpn/sync', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const force = req.body?.force === true || req.query.force === '1';
      const syncResult = await syncLiveUrbanVpnCatalog(force);
      const spainGateways = listUrbanVpnGateways({ spainOnly: true });
      res.json({ success: true, ...syncResult, spainGateways });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Error sincronizando pasarelas Urban VPN',
      });
    }
  });

  app.get('/api/vpn/probe', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const host = String(req.query.host || 'p-es1.urban-vpn.com').trim();
    const probe = await probeUrbanVpnGateway(host);
    res
      .status(probe.error === 'Host fuera de la lista verificada de pasarelas Urban VPN' ? 403 : 200)
      .json({
        success: probe.ok,
        probe,
      });
  });

  app.get('/api/vpn/probe-es', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const results = await probeAllSpainUrbanGateways();
      res.json({ success: true, total: results.length, probes: results });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Error probando nodos España',
      });
    }
  });

  app.get('/api/vpn/ovpn/:location', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const profile = getUrbanVpnOvpnProfile(req.params.location);
    if (!profile.ok) {
      return res.status(404).json({ success: false, error: profile.error });
    }
    const safeFilename = profile.filename.replace(/[^a-zA-Z0-9._-]/g, '');
    res.setHeader('Content-Type', 'application/x-openvpn-profile; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return res.send(profile.ovpnContent);
  });

  app.post('/api/vpn/verify-channels', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const report = await verifySpanishChannelsDirectAccess();
      res.json({ success: true, ...report });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Error verificando canales españoles',
      });
    }
  });

  app.post('/api/vpn/test', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const proxyUrl = String(req.body?.proxyUrl || '').trim();
    if (!proxyUrl) {
      const directGeo = await probeGeoExitInfo(undefined);
      return res.json({ success: directGeo.ok, geo: directGeo });
    }
    const validation = await validateSpainProxyUrl(proxyUrl);
    if (!validation.ok) {
      return res.status(400).json({ success: false, error: validation.error });
    }
    const geo = await probeGeoExitInfo(validation.normalizedUrl);
    return res.status(geo.ok ? 200 : 502).json({
      success: geo.ok,
      geo,
      error: geo.ok ? undefined : geo.error || 'No se pudo conectar a través del proxy indicado',
    });
  });

  app.post('/api/vpn/config', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const proxyUrl = req.body?.proxyUrl !== undefined ? String(req.body.proxyUrl) : undefined;
    const rawScope = String(req.body?.scope || 'auto_spanish').trim().toLowerCase();
    const scope: SpainProxyScope =
      rawScope === 'all_streaming' || rawScope === 'off' ? rawScope : 'auto_spanish';
    const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : undefined;

    const updated = await setRuntimeSpainProxyConfig({ proxyUrl, scope, enabled });
    if (!updated.ok) {
      return res.status(400).json({ success: false, error: updated.error });
    }
    return res.json({
      success: true,
      config: updated.config,
      tunneledGeo: updated.tunneledGeo,
    });
  });

  app.delete('/api/vpn/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const config = clearRuntimeSpainProxyConfig();
    res.json({ success: true, config });
  });
}
