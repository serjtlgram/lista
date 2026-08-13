// seed.ts — Initial starter items (5 Movies, 5 Series, 5 Books, 5 Games) in 4 languages
import { Item } from '../types';
import { Language } from '../locales/types';
import { FAVORITES_ID, UserList, DEFAULT_FOLDER_ID } from './lists';

interface LocalSeedDefinition {
  category: 'movie' | 'show' | 'book' | 'game';
  release_year: string;
  rating: number;
  director?: string;
  author?: string;
  seasons?: number;
  episodes_total?: number;
  poster_url: string;
  titles: Record<Language, string>;
  genres: Record<Language, string>;
  descriptions: Record<Language, string>;
}

export const LOCAL_SEED_DEFINITIONS: LocalSeedDefinition[] = [
  // 🎬 MOVIES (Favorites)
  {
    category: 'movie',
    release_year: '2010',
    rating: 9,
    director: 'Christopher Nolan',
    poster_url: 'https://image.tmdb.org/t/p/w500/oYuLEW9Spatial2zB8BoxqUvB3ZpT.jpg',
    titles: {
      en: 'Inception',
      ru: 'Начало',
      uk: 'Початок',
      es: 'Origen',
    },
    genres: {
      en: 'Sci-Fi, Action',
      ru: 'Научная фантастика, Боевик',
      uk: 'Наукова фантастика, Бойовик',
      es: 'Ciencia ficción, Acción',
    },
    descriptions: {
      en: 'A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.',
      ru: 'Кобб — виртуозный вор, лучший в опасном искусстве извлечения тайн из подсознания во время сна.',
      uk: 'Кобб — професійний злодій, який викрадає таємниці з підсвідомості людей під час сну.',
      es: 'Un ladrón que roba secretos corporativos a través de la tecnología de compartir sueños.',
    },
  },
  {
    category: 'movie',
    release_year: '1999',
    rating: 9,
    director: 'Lana Wachowski, Lilly Wachowski',
    poster_url: 'https://image.tmdb.org/t/p/w500/f89U3HXqDRRRd2wsWYFZM3oV2w.jpg',
    titles: {
      en: 'The Matrix',
      ru: 'Матрица',
      uk: 'Матриця',
      es: 'Matrix',
    },
    genres: {
      en: 'Sci-Fi, Action',
      ru: 'Научная фантастика, Боевик',
      uk: 'Наукова фантастика, Бойовик',
      es: 'Ciencia ficción, Acción',
    },
    descriptions: {
      en: 'A computer hacker learns from mysterious rebels about the true nature of his reality.',
      ru: 'Хакер Нео узнает правду: видимый мир — это Матрица, иллюзия, созданная разумными машинами.',
      uk: 'Хакер Нео дізнається правду про те, що реальний світ — це симуляція, створена штучним інтелектом.',
      es: 'Un hacker de computadora aprende sobre la verdadera naturaleza de su realidad.',
    },
  },
  {
    category: 'movie',
    release_year: '2014',
    rating: 9,
    director: 'Christopher Nolan',
    poster_url: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',
    titles: {
      en: 'Interstellar',
      ru: 'Интерстеллар',
      uk: 'Інтерстеллар',
      es: 'Interstellar',
    },
    genres: {
      en: 'Sci-Fi, Drama',
      ru: 'Научная фантастика, Драма',
      uk: 'Наукова фантастика, Драма',
      es: 'Ciencia ficción, Drama',
    },
    descriptions: {
      en: 'When Earth becomes uninhabitable, a team of researchers travels through a wormhole in search of a new home.',
      ru: 'Группа исследователей отправляется сквозь червоточину в поиске новой пригодной для жизни планеты.',
      uk: 'Група дослідників вирушає в космічну подорож крізь червоточину, щоб знайти нову планету.',
      es: 'Un equipo de investigadores viaja a través de un agujero de gusano en busca de un nuevo hogar.',
    },
  },
  {
    category: 'movie',
    release_year: '1985',
    rating: 9,
    director: 'Robert Zemeckis',
    poster_url: 'https://image.tmdb.org/t/p/w500/fNt1x9fB2jN29gZf222sKYAEUdX.jpg',
    titles: {
      en: 'Back to the Future',
      ru: 'Назад в будущее',
      uk: 'Назад у майбутнє',
      es: 'Regreso al futuro',
    },
    genres: {
      en: 'Sci-Fi, Comedy',
      ru: 'Научная фантастика, Комедия',
      uk: 'Наукова фантастика, Комедія',
      es: 'Ciencia ficción, Comedia',
    },
    descriptions: {
      en: 'Marty McFly is accidentally sent thirty years into the past in a time-traveling DeLorean.',
      ru: 'Марти Макфлай попадает из 1985 года в 1955-й на машине времени, созданной эксцентричным Доком Брауном.',
      uk: 'Підліток Марті Макфлай випадково повертається в 1955 рік на машині часу Делоріан.',
      es: 'Marty McFly es enviado accidentalmente treinta años al pasado en un DeLorean.',
    },
  },
  {
    category: 'movie',
    release_year: '2008',
    rating: 9,
    director: 'Christopher Nolan',
    poster_url: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    titles: {
      en: 'The Dark Knight',
      ru: 'Темный рыцарь',
      uk: 'Темний лицар',
      es: 'El caballero oscuro',
    },
    genres: {
      en: 'Action, Crime, Drama',
      ru: 'Боевик, Криминал, Драма',
      uk: 'Бойовик, Кримінал, Драма',
      es: 'Acción, Crimen, Drama',
    },
    descriptions: {
      en: 'When the menace known as the Joker wreaks havoc on Gotham, Batman must face one of the greatest psychological tests.',
      ru: 'Бэтмен вступает в психологическое и физическое противостояние с гениальным криминальным психопатом Джокером.',
      uk: 'Бетмен вступає в протистояння з кримінальним генієм Джокером, який занурює Готем у хаос.',
      es: 'Cuando la amenaza del Joker causa estragos en Gotham, Batman debe enfrentar su mayor prueba.',
    },
  },

  // 📺 TV SERIES (Favorites)
  {
    category: 'show',
    release_year: '2008',
    rating: 10,
    director: 'Vince Gilligan',
    seasons: 5,
    episodes_total: 62,
    poster_url: 'https://image.tmdb.org/t/p/w500/ztIm5BD70WwP32nF931XhPq2s6.jpg',
    titles: {
      en: 'Breaking Bad',
      ru: 'Во все тяжкие',
      uk: 'Пуститися берега',
      es: 'Breaking Bad',
    },
    genres: {
      en: 'Crime, Drama',
      ru: 'Криминал, Драма',
      uk: 'Кримінал, Драма',
      es: 'Crimen, Drama',
    },
    descriptions: {
      en: 'A chemistry teacher diagnosed with cancer turns to manufacturing methamphetamine with a former student.',
      ru: 'Учитель химии Уолтер Уайт узнает о смертельном диагнозе и начинает производить метамфетамин.',
      uk: 'Учитель хімії Волтер Уайт дізнається про смертельну хворобу і вирішує зайнятися виробництвом метамфетаміну.',
      es: 'Un profesor de química diagnosticado con cáncer recurre a la fabricación de metanfetamina.',
    },
  },
  {
    category: 'show',
    release_year: '2011',
    rating: 9,
    seasons: 8,
    episodes_total: 73,
    poster_url: 'https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1j1uTh.jpg',
    titles: {
      en: 'Game of Thrones',
      ru: 'Игра престолов',
      uk: 'Гра престолів',
      es: 'Juego de tronos',
    },
    genres: {
      en: 'Fantasy, Drama',
      ru: 'Фэнтези, Драма',
      uk: 'Фентезі, Драма',
      es: 'Fantasía, Drama',
    },
    descriptions: {
      en: 'Noble families fight for control over the lands of Westeros, while an ancient enemy returns.',
      ru: 'Великие дома Вестероса сражаются за Железный Трон, не замечая приближения древнего зла с Севера.',
      uk: 'Шляхетні родини Вестероса змагаються за контроль над Залізним Троном.',
      es: 'Familias nobles luchan por el control del Reino de Poniente mientras un antiguo enemigo regresa.',
    },
  },
  {
    category: 'show',
    release_year: '2016',
    rating: 9,
    seasons: 4,
    episodes_total: 34,
    poster_url: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg',
    titles: {
      en: 'Stranger Things',
      ru: 'Очень странные дела',
      uk: 'Дивні дива',
      es: 'Stranger Things',
    },
    genres: {
      en: 'Sci-Fi, Horror',
      ru: 'Научная фантастика, Ужасы',
      uk: 'Наукова фантастика, Жахи',
      es: 'Ciencia ficción, Terror',
    },
    descriptions: {
      en: 'When a young boy vanishes, a small town uncovers a mystery involving secret experiments and supernatural forces.',
      ru: 'В тихом городке Хоукинс исчезает мальчик, раскрывая тайну правительственных экспериментов.',
      uk: 'У містечку Гокінс зникає хлопчик, що призводить до розкриття таємничих експериментів.',
      es: 'Cuando un niño desaparece, un pequeño pueblo descubre un misterio que involucra experimentos secretos.',
    },
  },
  {
    category: 'show',
    release_year: '2019',
    rating: 10,
    director: 'Johan Renck',
    seasons: 1,
    episodes_total: 5,
    poster_url: 'https://image.tmdb.org/t/p/w500/hlLXt2tOPT6RRYXBhsnjuG2uvv2.jpg',
    titles: {
      en: 'Chernobyl',
      ru: 'Чернобыль',
      uk: 'Чорнобиль',
      es: 'Chernobyl',
    },
    genres: {
      en: 'Drama, History',
      ru: 'Драма, История',
      uk: 'Драма, Історія',
      es: 'Drama, Historia',
    },
    descriptions: {
      en: 'In April 1986, an explosion erupted at the Chernobyl nuclear power station. This series follows the liquidators.',
      ru: 'Хроника катастрофы на Чернобыльской АЭС в 1986 году и подвиг людей, упредивших еще большую трагедию.',
      uk: 'Драматична історія про аварію на Чорнобильській АЕС у 1986 році та ліквідаторів, які рятували світ.',
      es: 'La historia del desastre nuclear de Chernóbil en 1986 y los hombres y mujeres que sacrificaron todo.',
    },
  },
  {
    category: 'show',
    release_year: '2005',
    rating: 9,
    seasons: 9,
    episodes_total: 201,
    poster_url: 'https://image.tmdb.org/t/p/w500/3n2D2859LUg8qScRTuLGl0W7aTG.jpg',
    titles: {
      en: 'The Office',
      ru: 'Офис',
      uk: 'Офіс',
      es: 'The Office',
    },
    genres: {
      en: 'Comedy',
      ru: 'Комедия',
      uk: 'Комедія',
      es: 'Comedia',
    },
    descriptions: {
      en: 'A mockumentary on a group of typical office workers, where the workday consists of ego clashes and hilarious tedium.',
      ru: 'Комедийный псевдодокументальный сериал о веселой трудовой повседневности работников бумажной компании.',
      uk: 'Кумедний комедійний серіал про щоденне життя офісних працівників компанії Dunder Mifflin.',
      es: 'Un falso documental sobre un grupo de trabajadores de oficina típicos y su peculiar gerente.',
    },
  },

  // 📚 BOOKS (Unsorted / Неразобранное)
  {
    category: 'book',
    release_year: '1949',
    rating: 9,
    author: 'George Orwell',
    poster_url: 'https://m.media-amazon.com/images/I/71kxa1-0mfL._AC_UF1000,1000_QL80_.jpg',
    titles: {
      en: '1984',
      ru: '1984',
      uk: '1984',
      es: '1984',
    },
    genres: {
      en: 'Dystopian, Sci-Fi',
      ru: 'Антиутопия, Фантастика',
      uk: 'Антиутопія, Фантастика',
      es: 'Distopía, Ciencia ficción',
    },
    descriptions: {
      en: 'A dystopian social science fiction novel and cautionary tale about the dangers of totalitarianism.',
      ru: 'Знаменитый роман-антиутопия о тоталитарном государстве, Старшем Брате и уничтожении свободы мысли.',
      uk: 'Культовий роман-антиутопія Джорджа Орвелла про тоталітарне суспільство та контроль над особистістю.',
      es: 'Una novela de ciencia ficción distópica sobre los peligros del totalitarismo.',
    },
  },
  {
    category: 'book',
    release_year: '1943',
    rating: 10,
    author: 'Antoine de Saint-Exupéry',
    poster_url: 'https://m.media-amazon.com/images/I/71Ozy5bLtRL._AC_UF1000,1000_QL80_.jpg',
    titles: {
      en: 'The Little Prince',
      ru: 'Маленький принц',
      uk: 'Маленький принц',
      es: 'El principito',
    },
    genres: {
      en: 'Fable, Fiction',
      ru: 'Притча, Сказка',
      uk: 'Притча, Казка',
      es: 'Fábula, Ficción',
    },
    descriptions: {
      en: 'A young prince visits various planets, addressing themes of loneliness, friendship, love, and loss.',
      ru: 'Мудрая притча о дружбе, любви, ответственности и умении видеть главное сердцем.',
      uk: 'Поетична та зворушлива казка-притча про дружбу, любов та відповідальність за тих, кого приручили.',
      es: 'Un joven príncipe visita varios planetas abordando temas de soledad, amistad, amor y pérdida.',
    },
  },
  {
    category: 'book',
    release_year: '1997',
    rating: 9,
    author: 'J.K. Rowling',
    poster_url: 'https://m.media-amazon.com/images/I/81q77Q39nEL._AC_UF1000,1000_QL80_.jpg',
    titles: {
      en: "Harry Potter and the Sorcerer's Stone",
      ru: 'Гарри Поттер и философский камень',
      uk: 'Гаррі Поттер і філософський камінь',
      es: 'Harry Potter y la piedra filosofal',
    },
    genres: {
      en: 'Fantasy, Adventure',
      ru: 'Фэнтези, Приключения',
      uk: 'Фентезі, Пригоди',
      es: 'Fantasía, Aventuras',
    },
    descriptions: {
      en: 'An orphaned boy discovers he is a wizard and is invited to attend Hogwarts School of Witchcraft and Wizardry.',
      ru: 'Мальчик-сирота Гарри Поттер узнает о своем волшебном даре и отправляется учиться в школу магии Хогвартс.',
      uk: 'Хлопчик-сирота Гаррі Поттер дізнається про свій магічний дар і вирушає на навчання до школи Гоґвортс.',
      es: 'Un niño huérfano descubre que es un mago y asistirá a la Escuela Hogwarts de Magia y Hechicería.',
    },
  },
  {
    category: 'book',
    release_year: '1954',
    rating: 10,
    author: 'J.R.R. Tolkien',
    poster_url: 'https://m.media-amazon.com/images/I/71jLBXtWJWL._AC_UF1000,1000_QL80_.jpg',
    titles: {
      en: 'The Lord of the Rings',
      ru: 'Властелин колец',
      uk: 'Володар перснів',
      es: 'El Señor de los Anillos',
    },
    genres: {
      en: 'Fantasy, Epic',
      ru: 'Эпическое фэнтези',
      uk: 'Епічне фентезі',
      es: 'Fantasía épica',
    },
    descriptions: {
      en: 'The epic high-fantasy quest to destroy the One Ring and defeat the Dark Lord Sauron.',
      ru: 'Великое эпическое путешествие по Средиземью с целью уничтожить Кольцо Всевластья в огне Ородруина.',
      uk: 'Епічна трилогія про боротьбу добра і зла в Середзем\'ї та знищення Персня Всевладдя.',
      es: 'La épica novela de fantasía sobre la misión de destruir el Anillo Único y derrotar a Sauron.',
    },
  },
  {
    category: 'book',
    release_year: '1965',
    rating: 9,
    author: 'Frank Herbert',
    poster_url: 'https://m.media-amazon.com/images/I/81ym3QUd3KL._AC_UF1000,1000_QL80_.jpg',
    titles: {
      en: 'Dune',
      ru: 'Дюна',
      uk: 'Дюна',
      es: 'Dune',
    },
    genres: {
      en: 'Sci-Fi, Epic',
      ru: 'Научная фантастика',
      uk: 'Наукова фантастика',
      es: 'Ciencia ficción',
    },
    descriptions: {
      en: 'Paul Atreides leads nomadic tribes in a battle to control the desert planet Arrakis and its valuable spice.',
      ru: 'Захватывающая история о политике, религии и выживании на пустынной планете Арракис.',
      uk: 'Історія Пола Атріда на пустельній планеті Арракіс, де видобувають найцінніший ресурс у всесвіті.',
      es: 'Paul Atreides lidera a tribus en una batalla para controlar el planeta desértico Arrakis.',
    },
  },

  // 🎮 GAMES (Unsorted / Неразобранное)
  {
    category: 'game',
    release_year: '2015',
    rating: 10,
    poster_url: 'https://image.tmdb.org/t/p/w500/87x19M25L3L40x1k4aFp3K0p7A0.jpg',
    titles: {
      en: 'The Witcher 3: Wild Hunt',
      ru: 'Ведьмак 3: Дикая Охота',
      uk: 'Відьмак 3: Дикий Гін',
      es: 'The Witcher 3: Wild Hunt',
    },
    genres: {
      en: 'RPG, Adventure',
      ru: 'Ролевая игра, Приключения',
      uk: 'Рольова гра, Пригоди',
      es: 'RPG, Aventura',
    },
    descriptions: {
      en: 'Geralt of Rivia, a monster hunter for hire, embarks on an epic quest to find the Child of Prophecy.',
      ru: 'Ведьмак Геральт отправляется в масштабное путешествие по Континенту в поисках дитя предназначения.',
      uk: 'Відьмак Ґеральт із Рівії вирушає у масштабну подорож у пошуках Цірі, дитини з пророцтва.',
      es: 'Geralt de Rivia, un cazador de monstruos a sueldo, se embarca en una búsqueda épica.',
    },
  },
  {
    category: 'game',
    release_year: '2011',
    rating: 9,
    poster_url: 'https://m.media-amazon.com/images/I/61Wf-xRkSLL._AC_UF1000,1000_QL80_.jpg',
    titles: {
      en: 'Minecraft',
      ru: 'Minecraft',
      uk: 'Minecraft',
      es: 'Minecraft',
    },
    genres: {
      en: 'Sandbox, Survival',
      ru: 'Песочница, Выживание',
      uk: 'Пісочниця, Виживання',
      es: 'Sandbox, Supervivencia',
    },
    descriptions: {
      en: 'Explore infinite blocky worlds and build everything from simple homes to grand castles.',
      ru: 'Культовая игра-песочница с бесконечным кубическим миром для строительства и исследований.',
      uk: 'Культова гра-пісочниця, де гравці досліджують кубічний світ, будують та виживають.',
      es: 'Explora mundos infinitos de bloques y construye todo lo que puedas imaginar.',
    },
  },
  {
    category: 'game',
    release_year: '2018',
    rating: 10,
    poster_url: 'https://image.tmdb.org/t/p/w500/9e0Tz3Z7h8G783Zk8395gH.jpg',
    titles: {
      en: 'Red Dead Redemption 2',
      ru: 'Red Dead Redemption 2',
      uk: 'Red Dead Redemption 2',
      es: 'Red Dead Redemption 2',
    },
    genres: {
      en: 'Action, Open World',
      ru: 'Боевик, Открытый мир',
      uk: 'Бойовик, Відкритий світ',
      es: 'Acción, Mundo abierto',
    },
    descriptions: {
      en: 'Arthur Morgan and the Van der Linde gang are outlaws on the run across America at the turn of the century.',
      ru: 'Грандиозная история бандита Артура Моргана и банды Датча ван дер Линде на закате Дикого Запада.',
      uk: 'Захоплива історія про Артура Моргана та банду Ван дер Лінде на тлі занепаду епохи Дикого Заходу.',
      es: 'Arthur Morgan y la banda de Van der Linde son forajidos en fuga a través de América.',
    },
  },
  {
    category: 'game',
    release_year: '2013',
    rating: 9,
    poster_url: 'https://image.tmdb.org/t/p/w500/5vH8s97zX7A8b7k8z.jpg',
    titles: {
      en: 'Grand Theft Auto V',
      ru: 'Grand Theft Auto V',
      uk: 'Grand Theft Auto V',
      es: 'Grand Theft Auto V',
    },
    genres: {
      en: 'Action, Open World',
      ru: 'Боевик, Открытый мир',
      uk: 'Бойовик, Відкритий світ',
      es: 'Acción, Mundo abierto',
    },
    descriptions: {
      en: 'A street hustler, a retired bank robber, and a psychopath commit a series of dangerous heists in Los Santos.',
      ru: 'История трех грабителей, проворачивающих серию опаснейших ограблений в солнечной Калифорнии.',
      uk: 'Історія трьох грабіжників, які здійснюють серію зухвалих пограбувань у сонячному Лос-Сантосі.',
      es: 'Un estafador, un ladrón retirado y un psicópata cometen una serie de peligrosos atracos.',
    },
  },
  {
    category: 'game',
    release_year: '2011',
    rating: 10,
    poster_url: 'https://m.media-amazon.com/images/I/81hV4fP-HBL._AC_UF1000,1000_QL80_.jpg',
    titles: {
      en: 'Portal 2',
      ru: 'Portal 2',
      uk: 'Portal 2',
      es: 'Portal 2',
    },
    genres: {
      en: 'Puzzle, Sci-Fi',
      ru: 'Головоломка, Фантастика',
      uk: 'Головоломка, Фантастика',
      es: 'Puzles, Ciencia ficción',
    },
    descriptions: {
      en: 'Chell solves spatial puzzles with the Portal Gun in the ruined Aperture Science facility.',
      ru: 'Шедевральная пространственная головоломка с портальной пушкой в разрушенном комплексе Aperture.',
      uk: 'Шедевральна головоломка з портальною гарматою та чорним гумором у лабораторіях Aperture Science.',
      es: 'Chell resuelve puzles espaciales con la pistola de portales en las ruinas de Aperture Science.',
    },
  },
];

export function buildLocalSeedItems(lang: Language): { items: Item[]; favItemIds: string[] } {
  const items: Item[] = [];
  const favItemIds: string[] = [];

  LOCAL_SEED_DEFINITIONS.forEach((def, index) => {
    const id = `seed_${index + 1}_${def.category}_${Date.now()}`;
    const title = def.titles[lang] || def.titles['en'];
    const description = def.descriptions[lang] || def.descriptions['en'];
    const genre = def.genres[lang] || def.genres['en'];

    if (index < 10) {
      favItemIds.push(id);
    }

    const item: Item = {
      id,
      user_id: 1001,
      title,
      category: def.category,
      status: 'planned',
      rating: def.rating,
      genre,
      release_year: def.release_year,
      poster_url: def.poster_url,
      description,
      director: def.director,
      author: def.author,
      seasons: def.seasons,
      episodes_total: def.episodes_total,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    items.push(item);
  });

  return { items, favItemIds };
}
