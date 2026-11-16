import { describe, expect, it } from 'vitest';
import { UI_COPY, pickLang } from '../src/utils/i18n';
import { normalizeCatalogPillar, type CatalogSection } from '../src/components/MediaCatalogHub';

describe('3-language i18n dictionary & 5-pillar catalog navigation', () => {
  it('provides complete, non-empty UI_COPY parity across es, ca, and en', () => {
    const esKeys = Object.keys(UI_COPY.es).sort();
    const caKeys = Object.keys(UI_COPY.ca).sort();
    const enKeys = Object.keys(UI_COPY.en).sort();

    expect(caKeys).toEqual(esKeys);
    expect(enKeys).toEqual(esKeys);

    for (const locale of ['es', 'ca', 'en'] as const) {
      for (const key of esKeys) {
        const value = UI_COPY[locale][key as keyof typeof UI_COPY.es];
        expect(typeof value).toBe('string');
        expect(value.trim().length, `Missing translation for ${locale}.${key}`).toBeGreaterThan(0);
      }
    }

    expect(UI_COPY.es.pillarCatalog).not.toBe(UI_COPY.en.pillarCatalog);
    expect(UI_COPY.ca.pillarMyList).not.toBe(UI_COPY.es.pillarMyList);
    expect(UI_COPY.rif.pillarCatalog).toBe('Lafilmat d Siriyat');
    expect(UI_COPY.rif.pillarLive).toBe('Talfaza Direkt');
    expect(UI_COPY.rif.tabSports).toBe('Takurt n uḍar');

    // Verify absence of artificial standard Tamazight neologisms
    const rifValues = Object.values(UI_COPY.rif).join(' ');
    expect(rifValues).not.toMatch(/\bisura\b/i);
    expect(rifValues).not.toMatch(/\bimazraren\b/i);
    expect(rifValues).not.toMatch(/\btiliẓri\b/i);
    expect(rifValues).not.toMatch(/\badras\b/i);
    expect(rifValues).not.toMatch(/\bamsawal\b/i);
  });

  it('selects authentic spoken Riffian translations with exact glossary match', () => {
    // Dynamic patterns
    expect(pickLang('rif', { es: 'Hola, Naim', ca: 'Hola, Naim', en: 'Hi, Naim' })).toBe('Azul, Naim');
    expect(pickLang('rif', { es: 'Salir de la sala (Cine Club)', ca: 'Sortir de la sala (Cine Club)', en: 'Leave room (Cine Club)' })).toBe('Ffeɣ zi texxamt (Cine Club)');
    expect(pickLang('rif', { es: 'Sala de Naim', ca: 'Sala de Naim', en: "Naim's Room" })).toBe('Taxxamt n Naim');
    expect(pickLang('rif', { es: '12 vistos', ca: '12 vists', en: '12 watched' })).toBe('12 txzared');
    expect(pickLang('rif', { es: '5 guardados', ca: '5 desats', en: '5 saved' })).toBe('5 iḥefḍen');
    expect(pickLang('rif', { es: '24 canales', ca: '24 canals', en: '24 channels' })).toBe('24 lkanalat');

    // Glossary exact matches
    expect(pickLang('rif', { es: '¿Qué quieres ver hoy?', ca: 'Què vols veure avui?', en: 'What do you want to watch today?' })).toBe('Min texsed ad txzared ass-a?');
    expect(pickLang('rif', { es: 'Buscar películas, series, canales...', ca: 'Cercar pel·lícules, sèries, canals...', en: 'Search movies, series, channels...' })).toBe('Nadi xef lafilmat, siriyat, lkanalat...');
    expect(pickLang('rif', { es: 'Continuar viendo', ca: 'Continuar veient', en: 'Continue watching' })).toBe('Kemmel xzar');
    expect(pickLang('rif', { es: 'Catálogo 4K', ca: 'Catàleg 4K', en: '4K Catalog' })).toBe('Katalog 4K');
    expect(pickLang('rif', { es: 'Cine y Series', ca: 'Cine i Sèries', en: 'Movies & Series' })).toBe('Lafilmat d Siriyat');
    expect(pickLang('rif', { es: 'TV en Directo', ca: 'TV en Directe', en: 'Live TV' })).toBe('Talfaza Direkt');
    expect(pickLang('rif', { es: 'Juegos', ca: 'Jocs', en: 'Games' })).toBe('Iraren');
    expect(pickLang('rif', { es: 'Billar, Parchís, UNO y más', ca: 'Billar, Parxís, UNO i més', en: 'Pool, Parchís, UNO & more' })).toBe('Biyar, Parčis, UNO d waṭas nniḍen');
    expect(pickLang('rif', { es: 'Sala con Amigos', ca: 'Sala amb Amics', en: 'Watch Party' })).toBe('Taxxamt aked imddukkal');
    expect(pickLang('rif', { es: 'Sorpréndeme', ca: 'Sorprèn-me', en: 'Surprise me' })).toBe('Xtar-ayi s zhar');
    expect(pickLang('rif', { es: 'Elige algo al azar', ca: "Tria alguna cosa a l'atzar", en: 'Pick something at random' })).toBe('Xtar ca s zhar');
    expect(pickLang('rif', { es: 'Instalar RiffanTV', ca: 'Instal·lar RiffanTV', en: 'Install RiffanTV' })).toBe('Instali RiffanTV');
    expect(pickLang('rif', { es: 'Acerca de RiffanTV · Identidad y recursos de marca', ca: 'Quant a RiffanTV · Identitat i recursos de marca', en: 'About RiffanTV · Brand identity & media kit' })).toBe("Xef RiffanTV · L'identiti d wallalen");
    expect(pickLang('rif', { es: 'Cuenta, listas y dispositivos', ca: 'Compte, llistes i dispositius', en: 'Account, lists & devices' })).toBe("Lḥisab, llistat d l'ajhiza");
    expect(pickLang('rif', { es: 'Perfil invitado', ca: 'Perfil convidat', en: 'Guest profile' })).toBe('Profil n unebgi');
    expect(pickLang('rif', { es: 'Invitado', ca: 'Convidat', en: 'Guest' })).toBe('Anebgi');
    expect(pickLang('rif', { es: 'Perfil', ca: 'Perfil', en: 'Profile' })).toBe('Profil');
    expect(pickLang('rif', { es: 'Guardados', ca: 'Desats', en: 'Saved' })).toBe('Iḥefḍen');
    expect(pickLang('rif', { es: 'Notificaciones', ca: 'Notificacions', en: 'Notifications' })).toBe("L'ixbarat");
    expect(pickLang('rif', { es: 'Amigos e invitaciones', ca: 'Amics i invitacions', en: 'Friends & invites' })).toBe('Imddukkal d tneɛraḍin');
    expect(pickLang('rif', { es: 'Enviar a TV', ca: 'Enviar a TV', en: 'Cast to TV' })).toBe('Azen ɣer Talfaza');
    expect(pickLang('rif', { es: 'Perfil e historial', ca: 'Perfil i historial', en: 'Profile & history' })).toBe("Profil d l'istorik");
    expect(pickLang('rif', { es: 'Historial', ca: 'Historial', en: 'History' })).toBe("L'istorik");
    expect(pickLang('rif', { es: 'Ajustes', ca: 'Ajustos', en: 'Settings' })).toBe('Iglaj');
    expect(pickLang('rif', { es: 'Sala actual', ca: 'Sala actual', en: 'Current room' })).toBe('Taxxamt n tura');
    expect(pickLang('rif', { es: '+ Nueva sala', ca: '+ Nova sala', en: '+ New room' })).toBe('+ Taxxamt tajdit');
    expect(pickLang('rif', { es: 'Salir al Inicio', ca: "Sortir a l'Inici", en: 'Exit to Home' })).toBe('Uɣal ɣer Bdayt');
    expect(pickLang('rif', { es: 'Unirse con código o enlace de amigo...', ca: "Unir-se amb codi o enllaç d'amic...", en: 'Join friend code or link...' })).toBe('Udef s lkod neɣ llyan n umeddakel...');
    expect(pickLang('rif', { es: 'Unirse', ca: 'Unir-se', en: 'Join' })).toBe('Udef');
    expect(pickLang('rif', { es: 'Otras salas recientes', ca: 'Altres sales recents', en: 'Other recent rooms' })).toBe('Tixxamin nniḍen n tura');
    expect(pickLang('rif', { es: 'Tema Claro', ca: 'Tema Clar', en: 'Light Theme' })).toBe('Mod Acemlal');
    expect(pickLang('rif', { es: 'Tema Oscuro', ca: 'Tema Fosc', en: 'Dark Theme' })).toBe('Mod Aberkan');
    expect(pickLang('rif', { es: 'OLED Negro', ca: 'OLED Negre', en: 'OLED Black' })).toBe('Aberkan OLED');
    expect(pickLang('rif', { es: 'Noche Suave', ca: 'Nit Suau', en: 'Soft Night' })).toBe('Iḍ Aḥlawan');
    expect(pickLang('rif', { es: 'Alto Contraste', ca: 'Alt Contrast', en: 'High Contrast' })).toBe('Kontrast Ameqqran');
    expect(pickLang('rif', { es: 'Cómoda', ca: 'Còmoda', en: 'Comfortable' })).toBe('Yewseɛ');
    expect(pickLang('rif', { es: 'Compacta', ca: 'Compacta', en: 'Compact' })).toBe('Ameẓyan');
    expect(pickLang('rif', { es: 'Lite: OFF', ca: 'Lite: OFF', en: 'Lite: OFF' })).toBe('Afessas: Yensa');
    expect(pickLang('rif', { es: 'Lite: ON', ca: 'Lite: ON', en: 'Lite: ON' })).toBe('Afessas: Yexdem');
    expect(pickLang('rif', { es: 'Sincronización con Google', ca: 'Sincronització amb Google', en: 'Google Cloud Sync' })).toBe('Sankronizi aked Google');
    expect(pickLang('rif', { es: 'Iniciar sesión con Google', ca: 'Inicia sessió amb Google', en: 'Sign in with Google' })).toBe('Udef s Google');
    expect(pickLang('rif', { es: 'Ver / Reproducir', ca: 'Veure / Reproduir', en: 'Watch / Play' })).toBe('Xzar / Cɛel');
    expect(pickLang('rif', { es: 'Filtros', ca: 'Filtres', en: 'Filters' })).toBe('Ifiltraten');
    expect(pickLang('rif', { es: 'Chat', ca: 'Xat', en: 'Chat' })).toBe('Ccat');
    expect(pickLang('rif', { es: 'Cola', ca: 'Cua', en: 'Queue' })).toBe('Llista');
    expect(pickLang('rif', { es: 'Amigos', ca: 'Amics', en: 'Friends' })).toBe('Imddukkal');
    expect(pickLang('rif', { es: 'Salir', ca: 'Sortir', en: 'Leave / Exit' })).toBe('Ffeɣ');
  });

  it('selects the exact locale branch in pickLang for es, ca, and en', () => {
    const sample = {
      es: 'Películas',
      ca: 'Pel·lícules',
      en: 'Movies',
    };

    expect(pickLang('es', sample)).toBe('Películas');
    expect(pickLang('ca', sample)).toBe('Pel·lícules');
    expect(pickLang('en', sample)).toBe('Movies');
  });

  it('maps legacy CatalogSection identifiers into the 5 consolidated catalog pillars', () => {
    const expectedMapping: Record<CatalogSection, string> = {
      home: 'explore',
      movies: 'catalog',
      vose: 'catalog',
      series: 'catalog',
      castellano: 'catalog',
      catala: 'anime',
      anime: 'anime',
      tdt: 'live',
      sports: 'live',
      youtube: 'live',
      direct: 'mylist',
      games: 'games',
    };

    (Object.keys(expectedMapping) as CatalogSection[]).forEach((section) => {
      expect(normalizeCatalogPillar(section, false)).toBe(expectedMapping[section]);
      expect(normalizeCatalogPillar(section, true)).toBe('mylist');
    });
  });
});
