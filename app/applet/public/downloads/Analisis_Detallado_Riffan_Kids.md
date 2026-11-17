# Análisis Técnico y Funcional Exhaustivo: Riffan Kids (Naimpelis)

Este documento proporciona una descripción técnica, arquitectónica y funcional detallada del módulo **Riffan Kids** integrado en la plataforma **Naimpelis**. Se detallan todas las pantallas, componentes, juegos, sistemas de control parental, motores de audio/voz, adaptación por edades y tecnologías empleadas.

---

## 1. Arquitectura General y Filosofía de Diseño

**Riffan Kids** es un entorno seguro, inmersivo, gamificado y adaptativo diseñado específicamente para niños de entre 3 y 12 años, con soporte multilingüe de primer nivel (incluyendo **Rifeño / Tarifit**, Árabe, Español, Catalán, Inglés, Francés, Neerlandés y Chino).

### Características Principales:
- **Entorno Aislado y Seguro**: Protegido mediante PIN de salida (`1122`) para evitar que los menores salgan accidentalmente al catálogo general de adultos o modifiquen ajustes parentales.
- **Adaptación por Grupos de Edad**: La interfaz, los textos, la velocidad de lectura y los retos varían dinámicamente según la franja seleccionada (`3-5`, `6-8`, `9-12` años).
- **Gamificación Progresiva**: Sistema de estrellas, niveles, misiones diarias, cofres sorpresa, álbum de cromos coleccionables y tienda de avatares/mascotas virtuales.
- **Bienestar Digital**: Control de tiempo de pantalla diario y modo hora de dormir (*Bedtime Mode*) con atenuación visual.

---

## 2. Tecnologías y Librerías Empleadas

El módulo está construido íntegramente con tecnologías web modernas y robustas:
1. **React 18+ (Functional Components & Hooks)**: Gestión de estado reactiva y modular.
2. **TypeScript**: Tipado estricto para modelos de perfiles, catálogos, misiones y estados de juego.
3. **Tailwind CSS**: Estilos responsivos, animaciones fluidas y diseño adaptado a pantallas táctiles y televisores (Smart TV / Android TV con navegación espacial por mando).
4. **Zustand (`useKidsStore.ts`)**: Almacenamiento y sincronización de estado local (`localStorage`) con espejo en la nube de Firebase (`Firestore`) para familias vinculadas.
5. **HTML5 Canvas & RequestAnimationFrame**: Motores gráficos de alto rendimiento para juegos interactivos fluidos (`KidsMathBubblesGame`, `KidsSteamSortGame`, `KidsConfettiCanvas`).
6. **Web Audio API (`kidsAudioEngine.ts`)**: Síntesis procedural de efectos de sonido (saltos, aciertos, estrellas, clics, nivel superado) sin dependencia de archivos externos pesados.
7. **Web Speech API / Speech Synthesis (`kidsTtsHelper.ts`)**: Asistente de voz amigable para leer en voz alta los textos y títulos en la lengua nativa seleccionada por el niño.
8. **SVGs Personalizados e Iconografía Vectorial (`KidsSvgArt.tsx`)**: Ilustraciones vectoriales propias y mascotas animadas sin dependencias externas de imágenes rotas.

---

## 3. Desglose Detallado por Pantallas y Componentes (Screens & Views)

### 3.1. Pantalla de Bienvenida, Selector de Perfiles y Wizard (`KidsStepWizard.tsx` & `RiffanKidsHub.tsx`)
- **Gestión de Perfiles**: Permite crear perfiles infantiles personalizados seleccionando:
  - Nombre único del niño.
  - Avatar emoji o ilustración vectorial.
  - Franja de edad (`3-5`, `6-8`, `9-12`).
  - Idioma preferido de la interfaz (`es`, `ca`, `en`, `ar`, `rif`, `fr`, `nl`, `zh`).
- **Wizard de Incorporación**: Guía paso a paso al nuevo usuario para configurar su mascota virtual acompañante (ej. *Riffan the Fennec*, *Atlas Lion*, *Desert Dolphin*).

---

### 3.2. Portal Principal / Dashboard Kids (`RiffanKidsHub.tsx`)
Es la pantalla central donde el niño interactúa tras iniciar sesión. Consta de una barra superior de navegación y cuatro pestañas principales:

1. **Pestaña Portal (`portal`)**:
   - Resumen del perfil activo (Nivel actual, barra de experiencia, estrellas acumuladas y racha de días).
   - Acceso rápido a las misiones diarias (ej. *"Ver un vídeo educativo"*, *"Jugar 2 partidas de Matemáticas"*).
   - Carrusel de recomendaciones destacadas para niños (animaciones, cuentos, canciones infantiles en Tarifit y castellano).
   - Botón flotante del Álbum de Cromos y Tienda de Recompensas.

2. **Pestaña Cine y Series (`KidsCinemaTab.tsx`, `KidsIndependentPlayer.tsx`, `KidsTheaterOverlay.tsx`)**:
   - Catálogo seguro filtrado de películas de animación, series educativas y directos infantiles de RiffanTV.
   - Reproductor de vídeo independiente con controles gigantes y accesibles para manos pequeñas.
   - Selector de idioma de audio y subtítulos adaptado.
   - Sistema de saltos de intro y recordatorios de descanso por tiempo.

3. **Pestaña Diversión / Minijuegos (`KidsFunGames.tsx`)**:
   - **Burbujas Matemáticas (`KidsMathBubblesGame.tsx`)**: Juego educativo en HTML5 Canvas donde burbujas numéricas flotan hacia arriba y el niño debe reventar la que resuelve la operación aritmética mostrada (suma, resta, conteo visual según la edad), generando efectos de partículas y estrellas.
   - **Clasificador STEAM y Ecología (`KidsSteamSortGame.tsx`)**: Juego de arrastrar y soltar elementos (reciclaje, ciencia, engranajes mecánicos, naturaleza) en contenedores correctos para fomentar el pensamiento científico y sostenible.
   - **Estudio de Arte SVG (`KidsSvgArt.tsx`)**: Lienzo digital interactivo para colorear y estampar pegatinas vectoriales del patrimonio cultural del Rif y animales autóctonos.

4. **Pestaña Aprende (`KidsLearningGames.tsx`)**:
   - Módulos interactivos de vocabulario bilingüe (Rifeño/Tarifit ⇄ Español / Inglés / Árabe).
   - Cuentos interactivos con narración guiada y preguntas de comprensión lectora.

---

### 3.3. Control Parental y Configuración (`parentModalOpen`)
Accesible exclusivamente mediante la introducción del PIN numérico de seguridad (`1122`), permite a los padres:
- **Límite de Tiempo Diario**: Configurar apagar la pantalla tras 30, 60 o 120 minutos de uso continuo.
- **Modo Hora de Dormir (*Bedtime Mode*)**: Programar horario de bloqueo nocturno.
- **Modo Bajo Estímulo**: Reducir animaciones rápidas y colores estridentes para niños sensibles.
- **Gestión de Cuentas**: Eliminar o añadir perfiles y sincronizar copias de seguridad con Firebase.

---

### 3.4. Sistema de Internacionalización e Idiomas (`kidsI18n.ts` & `kidsTtsHelper.ts`)
- Diccionario completo integrado con términos específicos en **Rifeño (Tarifit)** además de las lenguas cooficiales y globales.
- Síntesis de voz automática que lee en voz alta los títulos y botones cuando el niño pulsa el icono de altavoz.

---

## 4. Resumen de Ficheros del Módulo Kids en el Código Fuente

| Fichero | Responsabilidad Principal |
| :--- | :--- |
| `src/store/useKidsStore.ts` | Estado global de perfiles, estrellas, misiones, tienda y ajustes de UX. |
| `src/components/kids/RiffanKidsHub.tsx` | Contenedor principal, pestañas, modales y barra de navegación Kids. |
| `src/components/kids/KidsCinemaTab.tsx` | Catálogo de vídeo seguro y selección de contenidos infantiles. |
| `src/components/kids/KidsIndependentPlayer.tsx` | Reproductor multimedia adaptado con controles táctiles grandes. |
| `src/components/kids/KidsTheaterOverlay.tsx` | Capa superpuesta de cine inmersivo para la experiencia de sala. |
| `src/components/kids/KidsFunGames.tsx` | Hub de juegos de entretenimiento y minijuegos arcades. |
| `src/components/kids/KidsLearningGames.tsx` | Hub de juegos educativos STEAM y vocabulario multilingüe. |
| `src/components/kids/KidsMathBubblesGame.tsx` | Minijuego canvas de matemáticas interactivas por burbujas. |
| `src/components/kids/KidsSteamSortGame.tsx` | Minijuego de clasificación ecológica y científica. |
| `src/components/kids/KidsSvgArt.tsx` | Motor de dibujo vectorial y arte interactivo SVG. |
| `src/components/kids/KidsStepWizard.tsx` | Asistente inicial de creación de perfiles y selección de mascotas. |
| `src/components/kids/kidsAudioEngine.ts` | Generador procedural de efectos de sonido con Web Audio API. |
| `src/components/kids/kidsTtsHelper.ts` | Asistente de lectura por voz (Text-To-Speech) multilingüe. |
| `src/components/kids/kidsI18n.ts` | Diccionarios de traducción (incluyendo Tarifit, Árabe, Español, Catalán). |
| `src/components/kids/KidsConfettiCanvas.tsx` | Animaciones de celebración con confeti en victorias y premios. |
| `src/components/kids/KidsPrimitives.tsx` | Componentes visuales base (`KidsSquishButton`, `KidsSpeakButton`). |

---
*Informe generado automáticamente para el usuario de Naimpelis / RiffanTV.*
