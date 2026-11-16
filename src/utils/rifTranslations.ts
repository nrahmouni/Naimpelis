/**
 * Riffian (Tarifit) localization dictionary and translation lookup for RiffanTV.
 */

export const RIF_DICTIONARY: Record<string, string> = {
  // Lobby & Hero
  'Tu sala privada para ver cine, series, TV y deporte juntos.': 'Taxxamt aked imeddukal nni Ssinima, Imazraren, Tiliẓri d waddal.',
  'Your private theater for movies, series, TV and sports together.': 'Taxxamt aked imeddukal nni Ssinima, Imazraren, Tiliẓri d waddal.',
  'Todo sincronizado en directo con tus amigos.': 'Atawi srid aked imeddukal-ik.',
  'Watch live in sync together.': 'Atawi srid aked imeddukal-ik.',
  'Continuar en tus salas': 'Kemmel di tixxamin-ik',
  'Continue in your rooms': 'Kemmel di tixxamin-ik',
  'Tu nombre en la sala': 'Isem-ik di taxxamt',
  'Your name': 'Isem-ik di taxxamt',
  'Enter': 'Kcem',
  'Join code': 'Tangalt nɣ assaɣ',
  'Install RiffanTV': 'Sbedd RiffanTV',

  // Navigation & Pillars
  'Explorar': 'Rzu',
  'Explore': 'Rzu',
  'Series y Cine': 'Imazraren d Ssinima',
  'Series & Movies': 'Imazraren d Ssinima',
  'Anime': 'Anime',
  'En Directo': 'Tiliẓri srid',
  'Live': 'Tiliẓri srid',
  'Mi Lista': 'Tammart inu',
  'My List': 'Tammart inu',

  // Common UI
  'Películas': 'Ssinima',
  'Movies': 'Ssinima',
  'Series TV': 'Imazraren',
  'TV Series': 'Imazraren',
  'TV España': 'Tiliẓri Sbayniyul',
  'Spanish TV': 'Tiliẓri Sbayniyul',
  'Fútbol · Vivo': 'Takurt n uḍar',
  'Football · Live': 'Takurt n uḍar',
  'YouTube': 'YouTube',
  'Chat': 'Amsawal',
  'Sala': 'Taxxamt',
  'Room': 'Taxxamt',
  'Cola · Enlace': 'Adras',
  'Queue & Link': 'Adras',

  'Ajustes': 'Iɣewwaren',
  'Settings': 'Iɣewwaren',
  'Cuenta': 'Amiḍan',
  'Account': 'Amiḍan',
  'Preferencias': 'Tifyarin',
  'Preferences': 'Tifyarin',
  'Cerrar sesión': 'Ffeɣ seg amiḍan',
  'Sign out': 'Ffeɣ seg amiḍan',
  'Instalar la app': 'Sbedd app',
  'Install app': 'Sbedd app',

  'Ver ahora': 'Ẓer tura',
  'Watch now': 'Ẓer tura',
  'A la cola': 'Rnu ɣer adras',
  'Add to queue': 'Rnu ɣer adras',
  'Invitar': 'Sɣur',
  'Invite': 'Sɣur',
  'Copiar enlace': 'Nɣel assaɣ',
  'Copy link': 'Nɣel assaɣ',
  'Copiado': 'Yenɣel',
  'Copied': 'Yenɣel',
  'Salir': 'Ffeɣ',
  'Leave': 'Ffeɣ',
  'Enviar': 'Azen',
  'Send': 'Azen',
  'Anfitrión': 'Anemhal',
  'Host': 'Anemhal',
  'Tú': 'Kečči',
  'You': 'Kečči',
};

export function lookupRifTranslation(enText?: string, esText?: string): string | null {
  if (esText && RIF_DICTIONARY[esText]) {
    return RIF_DICTIONARY[esText];
  }
  if (enText && RIF_DICTIONARY[enText]) {
    return RIF_DICTIONARY[enText];
  }
  return null;
}
