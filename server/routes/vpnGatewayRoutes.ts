/**
 * @module server/routes/vpnGatewayRoutes
 * @description API routes for cross-device Spain VPN / Egress Proxy management
 * and Urban VPN 1.0.97 static analysis & gateway probes.
 */

import type { Express } from 'express';
import {
  clearRuntimeSpainProxyConfig,
  getSpainGatewayOverview,
  getSpainGatewayPublicConfig,
  probeGeoExitInfo,
  setRuntimeSpainProxyConfig,
  validateSpainProxyUrl,
  type SpainProxyScope,
} from '../services/spainVpnGatewayService.ts';
import {
  listUrbanVpnGateways,
  probeUrbanVpnGateway,
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

  app.get('/api/vpn/probe', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const host = String(req.query.host || 'p-es1.urban-vpn.com').trim();
    const probe = await probeUrbanVpnGateway(host);
    res.status(probe.error === 'Host fuera de la lista verificada de pasarelas Urban VPN' ? 403 : 200).json({
      success: probe.ok,
      probe,
    });
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
