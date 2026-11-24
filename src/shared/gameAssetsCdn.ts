const KENNEY_CDN = 'https://raw.githubusercontent.com/shorepine/kenney/main';
const KENNEY_CITY_STARTER_CDN = 'https://cdn.jsdelivr.net/gh/KenneyNL/Starter-Kit-City-Builder@main/models';
const COLLECT_CARS_CDN = 'https://cdn.jsdelivr.net/gh/drcollect/collect-cars@main';
const THREE_GLTF_CDN = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf';
const POLYHAVEN_HDR_CDN = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k';
const POLYHAVEN_TEX_CDN = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k';

export const GAME_ASSET_CDN_MAP: Readonly<Record<string, string>> = {
  // ===== 3D GLB Models (Real Supercars / Endurance / Motorsport + Kenney Props + City Kits) =====
  'models/ferrari.glb': `${THREE_GLTF_CDN}/ferrari.glb`,
  'models/ferrari_ao.png': `${THREE_GLTF_CDN}/ferrari_ao.png`,
  'models/endurance.glb': `${COLLECT_CARS_CDN}/models/endurance.glb`,
  'models/hypercar.glb': `${COLLECT_CARS_CDN}/models/hypercar.glb`,
  'models/rally.glb': `${COLLECT_CARS_CDN}/models/rally.glb`,
  'models/wedge.glb': `${COLLECT_CARS_CDN}/models/wedge.glb`,
  'models/streamliner.glb': `${COLLECT_CARS_CDN}/models/streamliner.glb`,
  'cars/endurance-thumb.jpg': `${COLLECT_CARS_CDN}/images/endurance-thumb.jpg`,
  'cars/hypercar-thumb.jpg': `${COLLECT_CARS_CDN}/images/hypercar-thumb.jpg`,
  'cars/rally-thumb.jpg': `${COLLECT_CARS_CDN}/images/rally-thumb.jpg`,
  'cars/wedge-thumb.jpg': `${COLLECT_CARS_CDN}/images/wedge-thumb.jpg`,
  'cars/streamliner-thumb.jpg': `${COLLECT_CARS_CDN}/images/streamliner-thumb.jpg`,
  'models/race-future.glb': `${KENNEY_CDN}/3d/car/race-future.glb`,
  'models/race.glb': `${KENNEY_CDN}/3d/car/race.glb`,
  'models/sedan-sports.glb': `${KENNEY_CDN}/3d/car/sedan-sports.glb`,
  'models/hatchback-sports.glb': `${KENNEY_CDN}/3d/car/hatchback-sports.glb`,
  'models/suv-luxury.glb': `${KENNEY_CDN}/3d/car/suv-luxury.glb`,
  'models/police.glb': `${KENNEY_CDN}/3d/car/police.glb`,
  'models/city/building-a.glb': `${KENNEY_CDN}/3d/city-commercial/building-a.glb`,
  'models/city/building-b.glb': `${KENNEY_CDN}/3d/city-commercial/building-b.glb`,
  'models/city/building-c.glb': `${KENNEY_CDN}/3d/city-commercial/building-c.glb`,
  'models/city/building-d.glb': `${KENNEY_CDN}/3d/city-commercial/building-d.glb`,
  'models/city/building-e.glb': `${KENNEY_CDN}/3d/city-commercial/building-e.glb`,
  'models/city/building-f.glb': `${KENNEY_CDN}/3d/city-commercial/building-f.glb`,
  'models/city/building-skyscraper-a.glb': `${KENNEY_CDN}/3d/city-commercial/building-skyscraper-a.glb`,
  'models/city/building-skyscraper-b.glb': `${KENNEY_CDN}/3d/city-commercial/building-skyscraper-b.glb`,
  'models/city/building-skyscraper-c.glb': `${KENNEY_CDN}/3d/city-commercial/building-skyscraper-c.glb`,
  'models/city/building-skyscraper-d.glb': `${KENNEY_CDN}/3d/city-commercial/building-skyscraper-d.glb`,
  'models/city/building-skyscraper-e.glb': `${KENNEY_CDN}/3d/city-commercial/building-skyscraper-e.glb`,
  'models/city/low-detail-building-a.glb': `${KENNEY_CDN}/3d/city-commercial/low-detail-building-a.glb`,
  'models/city/low-detail-building-b.glb': `${KENNEY_CDN}/3d/city-commercial/low-detail-building-b.glb`,
  'models/city/low-detail-building-c.glb': `${KENNEY_CDN}/3d/city-commercial/low-detail-building-c.glb`,
  'models/city/low-detail-building-d.glb': `${KENNEY_CDN}/3d/city-commercial/low-detail-building-d.glb`,
  'models/city-builder/building-small-a.glb': `${KENNEY_CITY_STARTER_CDN}/building-small-a.glb`,
  'models/city-builder/building-small-b.glb': `${KENNEY_CITY_STARTER_CDN}/building-small-b.glb`,
  'models/city-builder/building-small-c.glb': `${KENNEY_CITY_STARTER_CDN}/building-small-c.glb`,
  'models/city-builder/building-small-d.glb': `${KENNEY_CITY_STARTER_CDN}/building-small-d.glb`,
  'models/city-builder/building-garage.glb': `${KENNEY_CITY_STARTER_CDN}/building-garage.glb`,
  'models/city-builder/pavement-fountain.glb': `${KENNEY_CITY_STARTER_CDN}/pavement-fountain.glb`,
  'models/city-builder/road-straight-lightposts.glb': `${KENNEY_CITY_STARTER_CDN}/road-straight-lightposts.glb`,
  'models/grandStandCovered.glb': `${KENNEY_CDN}/3d/racing/grandStandCovered.glb`,
  'models/grandStandCoveredRound.glb': `${KENNEY_CDN}/3d/racing/grandStandCoveredRound.glb`,
  'models/overheadLights.glb': `${KENNEY_CDN}/3d/racing/overheadLights.glb`,
  'models/lightPostLarge.glb': `${KENNEY_CDN}/3d/racing/lightPostLarge.glb`,
  'models/pitsGarage.glb': `${KENNEY_CDN}/3d/racing/pitsGarage.glb`,
  'models/barrierRed.glb': `${KENNEY_CDN}/3d/racing/barrierRed.glb`,
  'models/barrierWhite.glb': `${KENNEY_CDN}/3d/racing/barrierWhite.glb`,
  'models/barrierWall.glb': `${KENNEY_CDN}/3d/racing/barrierWall.glb`,
  'models/billboard.glb': `${KENNEY_CDN}/3d/racing/billboard.glb`,
  'models/bannerTowerRed.glb': `${KENNEY_CDN}/3d/racing/bannerTowerRed.glb`,
  'models/bannerTowerGreen.glb': `${KENNEY_CDN}/3d/racing/bannerTowerGreen.glb`,
  'models/flagCheckers.glb': `${KENNEY_CDN}/3d/racing/flagCheckers.glb`,
  'models/treeLarge.glb': `${KENNEY_CDN}/3d/racing/treeLarge.glb`,
  'models/treeSmall.glb': `${KENNEY_CDN}/3d/racing/treeSmall.glb`,
  'models/RobotExpressive.glb': `${THREE_GLTF_CDN}/RobotExpressive/RobotExpressive.glb`,
  'models/Soldier.glb': `${THREE_GLTF_CDN}/Soldier.glb`,
  'models/Xbot.glb': `${THREE_GLTF_CDN}/Xbot.glb`,
  'models/Michelle.glb': `${THREE_GLTF_CDN}/Michelle.glb`,
  'models/CesiumMan.glb': 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/CesiumMan/glTF-Binary/CesiumMan.glb',
  'models/Fox.glb': 'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/Fox/glTF-Binary/Fox.glb',

  // ===== Poly Haven CC0 1K HDRI Environments (Zero-key direct CDN, CORS *) =====
  'hdri/moonless_golf_1k.hdr': `${POLYHAVEN_HDR_CDN}/moonless_golf_1k.hdr`,
  'hdri/puresky_1k.hdr': `${POLYHAVEN_HDR_CDN}/kloofendal_48d_partly_cloudy_puresky_1k.hdr`,
  'hdri/studio_small_09_1k.hdr': `${POLYHAVEN_HDR_CDN}/studio_small_09_1k.hdr`,
  'hdri/venice_sunset_1k.hdr': `${POLYHAVEN_HDR_CDN}/venice_sunset_1k.hdr`,
  'hdri/evening_road_01_1k.hdr': `${POLYHAVEN_HDR_CDN}/evening_road_01_1k.hdr`,
  'hdri/lebombo_1k.hdr': `${POLYHAVEN_HDR_CDN}/lebombo_1k.hdr`,

  // ===== Rive Interactive Vector Animations CDN (CORS * verified) =====
  'rive/skills.riv': 'https://cdn.rive.app/animations/vehicles.riv',
  'rive/vehicles.riv': 'https://cdn.rive.app/animations/vehicles.riv',

  // ===== HD Photorealistic Arena Backdrops & Poly Haven PBR Textures (CC0, CORS *) =====
  'penalty/stadium_backdrop.jpg':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/NotreDameStadiumNight.jpg/1280px-NotreDameStadiumNight.jpg',
  'arenas/soccer_stadium.jpg':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Camp_Nou_aerial_%28cropped%29.jpg/1280px-Camp_Nou_aerial_%28cropped%29.jpg',
  'arenas/bowling_alley.jpg':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Sunset_Lanes_bowling_alley_-_Beaverton%2C_OR_%282015%29.jpg/1280px-Sunset_Lanes_bowling_alley_-_Beaverton%2C_OR_%282015%29.jpg',
  'arenas/tennis_court.jpg':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/Wimbledon_Centre_Court_2017_cropped.jpg/1280px-Wimbledon_Centre_Court_2017_cropped.jpg',
  'arenas/labyrinth_board.jpg': `${POLYHAVEN_TEX_CDN}/oak_veneer_01/oak_veneer_01_diff_1k.jpg`,
  'pbr/oak_diff.jpg': `${POLYHAVEN_TEX_CDN}/oak_veneer_01/oak_veneer_01_diff_1k.jpg`,
  'pbr/oak_rough.jpg': `${POLYHAVEN_TEX_CDN}/oak_veneer_01/oak_veneer_01_rough_1k.jpg`,
  'pbr/wood_floor_diff.jpg': `${POLYHAVEN_TEX_CDN}/wood_floor_deck/wood_floor_deck_diff_1k.jpg`,
  'pbr/wood_floor_nor.jpg': `${POLYHAVEN_TEX_CDN}/wood_floor_deck/wood_floor_deck_nor_gl_1k.jpg`,
  'pbr/asphalt_diff.jpg': `${POLYHAVEN_TEX_CDN}/asphalt_track/asphalt_track_diff_1k.jpg`,
  'pbr/asphalt_nor.jpg': `${POLYHAVEN_TEX_CDN}/asphalt_track/asphalt_track_nor_gl_1k.jpg`,
  'pbr/asphalt_rough.jpg': `${POLYHAVEN_TEX_CDN}/asphalt_track/asphalt_track_rough_1k.jpg`,
  'pbr/concrete_worn_diff.jpg': `${POLYHAVEN_TEX_CDN}/concrete_floor_worn_001/concrete_floor_worn_001_diff_1k.jpg`,
  'pbr/grass_diff.jpg': `${POLYHAVEN_TEX_CDN}/aerial_grass_rock/aerial_grass_rock_diff_1k.jpg`,
  'pbr/forrest_ground_diff.jpg': `${POLYHAVEN_TEX_CDN}/forrest_ground_01/forrest_ground_01_diff_1k.jpg`,
  'pbr/rubber_tiles_diff.jpg': `${POLYHAVEN_TEX_CDN}/rubber_tiles/rubber_tiles_diff_1k.jpg`,

  // ===== Explosion Pack =====
  'explosion/groundExplosion00.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion00.png`,
  'explosion/groundExplosion01.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion01.png`,
  'explosion/groundExplosion02.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion02.png`,
  'explosion/groundExplosion03.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion03.png`,
  'explosion/groundExplosion04.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion04.png`,
  'explosion/groundExplosion05.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion05.png`,
  'explosion/groundExplosion06.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion06.png`,
  'explosion/groundExplosion07.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion07.png`,
  'explosion/groundExplosion08.png': `${KENNEY_CDN}/2d/Explosion%20Pack/Ground%20explosion/groundExplosion08.png`,

  // ===== Space Shooter Remastered =====
  'space/blue.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Backgrounds/blue.png`,
  'space/darkPurple.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Backgrounds/darkPurple.png`,
  'space/playerShip1_blue.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/playerShip1_blue.png`,
  'space/playerShip2_orange.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/playerShip2_orange.png`,
  'space/playerShip3_red.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/playerShip3_red.png`,
  'space/ufoRed.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/ufoRed.png`,
  'space/enemyBlue1.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Enemies/enemyBlue1.png`,
  'space/enemyGreen2.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Enemies/enemyGreen2.png`,
  'space/enemyRed3.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Enemies/enemyRed3.png`,
  'space/laserBlue01.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Lasers/laserBlue01.png`,
  'space/laserRed01.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Lasers/laserRed01.png`,
  'space/meteorBrown_big1.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Meteors/meteorBrown_big1.png`,
  'space/meteorGrey_big1.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Meteors/meteorGrey_big1.png`,
  'space/fire00.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Effects/fire00.png`,
  'space/fire01.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Effects/fire01.png`,
  'space/shield3.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Effects/shield3.png`,
  'space/pill_blue.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Power-ups/pill_blue.png`,
  'space/pill_green.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Power-ups/pill_green.png`,
  'space/pill_red.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Power-ups/pill_red.png`,
  'space/powerupBlue_bolt.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Power-ups/powerupBlue_bolt.png`,
  'space/powerupBlue_shield.png': `${KENNEY_CDN}/2d/Space%20Shooter%20Remastered/Power-ups/powerupBlue_shield.png`,

  // ===== Tappy Plane =====
  'tappy/background.png': `${KENNEY_CDN}/2d/Tappy%20Plane/background.png`,
  'tappy/groundGrass.png': `${KENNEY_CDN}/2d/Tappy%20Plane/groundGrass.png`,
  'tappy/rockGrass.png': `${KENNEY_CDN}/2d/Tappy%20Plane/rockGrass.png`,
  'tappy/rockGrassDown.png': `${KENNEY_CDN}/2d/Tappy%20Plane/rockGrassDown.png`,
  'tappy/puffLarge.png': `${KENNEY_CDN}/2d/Tappy%20Plane/puffLarge.png`,
  'tappy/planeYellow1.png': `${KENNEY_CDN}/2d/Tappy%20Plane/Planes/planeYellow1.png`,
  'tappy/planeYellow2.png': `${KENNEY_CDN}/2d/Tappy%20Plane/Planes/planeYellow2.png`,
  'tappy/planeYellow3.png': `${KENNEY_CDN}/2d/Tappy%20Plane/Planes/planeYellow3.png`,

  // ===== Medals =====
  'medals/medalBronze.png': `${KENNEY_CDN}/2d/Tappy%20Plane/UI/medalBronze.png`,
  'medals/medalSilver.png': `${KENNEY_CDN}/2d/Tappy%20Plane/UI/medalSilver.png`,
  'medals/medalGold.png': `${KENNEY_CDN}/2d/Tappy%20Plane/UI/medalGold.png`,

  // ===== Bomberman / Sokoban Pack =====
  'bomberman/ground_06.png': `${KENNEY_CDN}/2d/Sokoban%20Pack/Retina/Ground/ground_06.png`,
  'bomberman/block_01.png': `${KENNEY_CDN}/2d/Sokoban%20Pack/Retina/Blocks/block_01.png`,
  'bomberman/crate_01.png': `${KENNEY_CDN}/2d/Sokoban%20Pack/Retina/Crates/crate_01.png`,
  'bomberman/player_01.png': `${KENNEY_CDN}/2d/Sokoban%20Pack/Retina/Player/player_01.png`,
  'bomberman/player_05.png': `${KENNEY_CDN}/2d/Sokoban%20Pack/Retina/Player/player_05.png`,
  'bomberman/player_11.png': `${KENNEY_CDN}/2d/Sokoban%20Pack/Retina/Player/player_11.png`,
  'bomberman/player_17.png': `${KENNEY_CDN}/2d/Sokoban%20Pack/Retina/Player/player_17.png`,

  // ===== Puzzle Pack 1 (Retina / Double) =====
  'puzzle/ballBlue.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/ballBlue.png`,
  'puzzle/ballGrey.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/ballGrey.png`,
  'puzzle/paddleBlu.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/paddleBlu.png`,
  'puzzle/paddleRed.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/paddleRed.png`,
  'puzzle/particleStar.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/particleStar.png`,
  'puzzle/element_blue_rectangle_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_blue_rectangle_glossy.png`,
  'puzzle/element_green_rectangle_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_green_rectangle_glossy.png`,
  'puzzle/element_grey_rectangle_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_grey_rectangle_glossy.png`,
  'puzzle/element_purple_rectangle_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_purple_rectangle_glossy.png`,
  'puzzle/element_red_rectangle_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_red_rectangle_glossy.png`,
  'puzzle/element_yellow_rectangle_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_yellow_rectangle_glossy.png`,
  'puzzle/element_blue_square_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_blue_square_glossy.png`,
  'puzzle/element_green_square_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_green_square_glossy.png`,
  'puzzle/element_grey_square_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_grey_square_glossy.png`,
  'puzzle/element_purple_square.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_purple_square.png`,
  'puzzle/element_red_square_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_red_square_glossy.png`,
  'puzzle/element_yellow_square_glossy.png': `${KENNEY_CDN}/2d/Puzzle%20Pack%201/Double/element_yellow_square_glossy.png`,

  // ===== Rolling Ball Pack =====
  'rolling/ball_blue_large.png': `${KENNEY_CDN}/2d/Rolling%20Ball%20Assets/Retina/ball_blue_large.png`,
  'rolling/ball_red_large.png': `${KENNEY_CDN}/2d/Rolling%20Ball%20Assets/Retina/ball_red_large.png`,
  'rolling/block_corner_large.png': `${KENNEY_CDN}/2d/Rolling%20Ball%20Assets/Retina/block_corner_large.png`,
  'rolling/block_large.png': `${KENNEY_CDN}/2d/Rolling%20Ball%20Assets/Retina/block_large.png`,
  'rolling/hole_large.png': `${KENNEY_CDN}/2d/Rolling%20Ball%20Assets/Retina/hole_large.png`,
  'rolling/hole_large_end.png': `${KENNEY_CDN}/2d/Rolling%20Ball%20Assets/Retina/hole_large_end.png`,

  // ===== Particle Pack (Transparent) =====
  'particles/spark_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/spark_01.png`,
  'particles/spark_02.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/spark_02.png`,
  'particles/spark_03.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/spark_03.png`,
  'particles/star_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/star_01.png`,
  'particles/star_04.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/star_04.png`,
  'particles/star_07.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/star_07.png`,
  'particles/flare_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/flare_01.png`,
  'particles/slash_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/slash_01.png`,
  'particles/slash_02.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/slash_02.png`,
  'particles/smoke_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/smoke_01.png`,
  'particles/circle_02.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/circle_02.png`,
  'particles/magic_04.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/magic_04.png`,
  'particles/muzzle_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/muzzle_01.png`,
  'particles/twirl_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/twirl_01.png`,
  'particles/light_01.png': `${KENNEY_CDN}/2d/Particle%20Pack/PNG%20(Transparent)/light_01.png`,

  // ===== Sports Pack =====
  'sports/ball_bowling1.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_bowling1.png`,
  'sports/ball_bowling2.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_bowling2.png`,
  'sports/ball_bowling3.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_bowling3.png`,
  'sports/ball_puck.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_puck.png`,
  'sports/ball_soccer1.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_soccer1.png`,
  'sports/ball_soccer2.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_soccer2.png`,
  'sports/ball_tennis1.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_tennis1.png`,
  'sports/ball_tennis2.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/ball_tennis2.png`,
  'sports/racket_metal.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/racket_metal.png`,
  'sports/racket_wood.png': `${KENNEY_CDN}/2d/Sports%20Pack/Equipment/racket_wood.png`,
  'sports/character_blue_1.png': `${KENNEY_CDN}/2d/Sports%20Pack/Blue/characterBlue%20(1).png`,
  'sports/character_blue_2.png': `${KENNEY_CDN}/2d/Sports%20Pack/Blue/characterBlue%20(2).png`,
  'sports/character_blue_3.png': `${KENNEY_CDN}/2d/Sports%20Pack/Blue/characterBlue%20(3).png`,
  'sports/character_red_1.png': `${KENNEY_CDN}/2d/Sports%20Pack/Red/characterRed%20(1).png`,
  'sports/character_red_2.png': `${KENNEY_CDN}/2d/Sports%20Pack/Red/characterRed%20(2).png`,
  'sports/character_red_3.png': `${KENNEY_CDN}/2d/Sports%20Pack/Red/characterRed%20(3).png`,

  // ===== Toon Characters HD =====
  'toon/male_idle.png': `${KENNEY_CDN}/2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_idle.png`,
  'toon/male_run0.png': `${KENNEY_CDN}/2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_run0.png`,
  'toon/male_run1.png': `${KENNEY_CDN}/2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_run1.png`,
  'toon/male_run2.png': `${KENNEY_CDN}/2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_run2.png`,
  'toon/male_kick.png': `${KENNEY_CDN}/2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_kick.png`,
  'toon/male_jump.png': `${KENNEY_CDN}/2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_jump.png`,
  'toon/male_cheer0.png': `${KENNEY_CDN}/2d/Toon%20Characters/Male%20person/Poses%20HD/character_malePerson_cheer0.png`,
  'toon/female_idle.png': `${KENNEY_CDN}/2d/Toon%20Characters/Female%20person/Poses%20HD/character_femalePerson_idle.png`,
  'toon/female_kick.png': `${KENNEY_CDN}/2d/Toon%20Characters/Female%20person/Poses%20HD/character_femalePerson_kick.png`,
  'toon/female_cheer0.png': `${KENNEY_CDN}/2d/Toon%20Characters/Female%20person/Poses%20HD/character_femalePerson_cheer0.png`,
  'toon/robot_idle.png': `${KENNEY_CDN}/2d/Toon%20Characters/Robot/Poses%20HD/character_robot_idle.png`,
  'toon/robot_cheer0.png': `${KENNEY_CDN}/2d/Toon%20Characters/Robot/Poses%20HD/character_robot_cheer0.png`,
};

const CIRCLE_FLAG_ALIAS: Readonly<Record<string, string>> = {
  en: 'gb-eng',
  uk: 'gb',
  gb: 'gb',
  wal: 'gb-wls',
  sco: 'gb-sct',
  cat: 'es-ct',
  spain: 'es',
  brazil: 'br',
  argentina: 'ar',
  france: 'fr',
  germany: 'de',
  belgium: 'be',
  portugal: 'pt',
  italy: 'it',
  netherlands: 'nl',
  england: 'gb-eng',
  switzerland: 'ch',
  croatia: 'hr',
  morocco: 'ma',
  japan: 'jp',
  colombia: 'co',
  mexico: 'mx',
  usa: 'us',
  uruguay: 'uy',
};

export function getCircleFlagCdnUrl(codeOrTeamId: string): string {
  const clean = String(codeOrTeamId || 'es').trim().toLowerCase();
  const mapped = CIRCLE_FLAG_ALIAS[clean] || clean.replace(/[^a-z-]/g, '') || 'es';
  return `https://hatscripts.github.io/circle-flags/flags/${mapped}.svg`;
}

export function getPlayingCardSvgUrl(rank: string, suit: string): string {
  const rRaw = String(rank || '').trim().toUpperCase();
  const sRaw = String(suit || '').trim().toLowerCase();
  const rankMap: Record<string, string> = {
    A: 'ace',
    '1': 'ace',
    K: 'king',
    Q: 'queen',
    J: 'jack',
    T: '10',
  };
  const suitMap: Record<string, string> = {
    spades: 'spades',
    s: 'spades',
    '♠': 'spades',
    hearts: 'hearts',
    h: 'hearts',
    '♥': 'hearts',
    diamonds: 'diamonds',
    d: 'diamonds',
    '♦': 'diamonds',
    clubs: 'clubs',
    c: 'clubs',
    '♣': 'clubs',
  };
  const rName = rankMap[rRaw] || rRaw.toLowerCase();
  const sName = suitMap[sRaw] || 'spades';
  return `https://cdn.jsdelivr.net/gh/hayeah/playing-cards-assets@master/svg/${rName}_of_${sName}.svg`;
}

export function getDiceBearAvatarUrl(
  seed: string,
  style: 'bottts-neutral' | 'avataaars-neutral' | 'fun-emoji' = 'bottts-neutral'
): string {
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed || 'player')}`;
}

export function resolveGameAssetUrl(relPath: string): string {
  const raw = String(relPath || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  const cleaned = raw.replace(/^(\.\/|\/)+/, '').replace(/^assets\/games\//, '');
  if (GAME_ASSET_CDN_MAP[cleaned]) {
    return GAME_ASSET_CDN_MAP[cleaned];
  }
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return `./${raw.replace(/^(\.\/|\/)+/, '')}`;
  }
  return `/${raw.replace(/^(\.\/|\/)+/, '')}`;
}
