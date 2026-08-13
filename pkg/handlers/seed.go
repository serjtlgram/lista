package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"lista/pkg/db"
)

type SeedItem struct {
	Category    string
	ReleaseYear string
	Rating      int
	Genre       map[string]string
	Director    string
	Author      string
	Seasons     int
	Episodes    int
	Titles      map[string]string
	Descs       map[string]string
	PosterURL   string
}

var defaultSeedItems = []SeedItem{
	// 🎬 MOVIES (Favorites)
	{
		Category:    "movie",
		ReleaseYear: "2010",
		Rating:      9,
		Director:    "Christopher Nolan",
		PosterURL:   "https://image.tmdb.org/t/p/w500/oYuLEW9Spatial2zB8BoxqUvB3ZpT.jpg",
		Genre: map[string]string{
			"en": "Sci-Fi, Action",
			"ru": "Научная фантастика, Боевик",
			"uk": "Наукова фантастика, Бойовик",
			"es": "Ciencia ficción, Acción",
		},
		Titles: map[string]string{
			"en": "Inception",
			"ru": "Начало",
			"uk": "Початок",
			"es": "Origen",
		},
		Descs: map[string]string{
			"en": "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
			"ru": "Кобб — виртуозный вор, лучший в опасном искусстве извлечения тайн из подсознания во время сна.",
			"uk": "Кобб — професійний злодій, який викрадає таємниці з підсвідомості людей під час сну.",
			"es": "Un ladrón que roba secretos corporativos a través de la tecnología de compartir sueños recibe la tarea de plantar una idea.",
		},
	},
	{
		Category:    "movie",
		ReleaseYear: "1999",
		Rating:      9,
		Director:    "Lana Wachowski, Lilly Wachowski",
		PosterURL:   "https://image.tmdb.org/t/p/w500/f89U3HXqDRRRd2wsWYFZM3oV2w.jpg",
		Genre: map[string]string{
			"en": "Sci-Fi, Action",
			"ru": "Научная фантастика, Боевик",
			"uk": "Наукова фантастика, Бойовик",
			"es": "Ciencia ficción, Acción",
		},
		Titles: map[string]string{
			"en": "The Matrix",
			"ru": "Матрица",
			"uk": "Матриця",
			"es": "Matrix",
		},
		Descs: map[string]string{
			"en": "A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers.",
			"ru": "Хакер Нео узнает правду: видимый мир — это Матрица, иллюзия, созданная разумными машинами.",
			"uk": "Хакер Нео дізнається правду про те, що реальний світ — це симуляція, створена штучним інтелектом.",
			"es": "Un hacker de computadora aprende sobre la verdadera naturaleza de su realidad y su papel en la guerra.",
		},
	},
	{
		Category:    "movie",
		ReleaseYear: "2014",
		Rating:      9,
		Director:    "Christopher Nolan",
		PosterURL:   "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
		Genre: map[string]string{
			"en": "Sci-Fi, Drama",
			"ru": "Научная фантастика, Драма",
			"uk": "Наукова фантастика, Драма",
			"es": "Ciencia ficción, Drama",
		},
		Titles: map[string]string{
			"en": "Interstellar",
			"ru": "Интерстеллар",
			"uk": "Інтерстеллар",
			"es": "Interstellar",
		},
		Descs: map[string]string{
			"en": "When Earth becomes uninhabitable, a team of researchers travels through a wormhole in search of a new home for humanity.",
			"ru": "Группа исследователей отправляется сквозь червоточину в поиске новой пригодной для жизни планеты.",
			"uk": "Група дослідників вирушає в космічну подорож крізь червоточину, щоб знайти нову планету для людства.",
			"es": "Un equipo de investigadores viaja a través de un agujero de gusano en busca de un nuevo hogar para la humanidad.",
		},
	},
	{
		Category:    "movie",
		ReleaseYear: "1985",
		Rating:      9,
		Director:    "Robert Zemeckis",
		PosterURL:   "https://image.tmdb.org/t/p/w500/fNt1x9fB2jN29gZf222sKYAEUdX.jpg",
		Genre: map[string]string{
			"en": "Sci-Fi, Comedy",
			"ru": "Научная фантастика, Комедия",
			"uk": "Наукова фантастика, Комедія",
			"es": "Ciencia ficción, Comedia",
		},
		Titles: map[string]string{
			"en": "Back to the Future",
			"ru": "Назад в будущее",
			"uk": "Назад у майбутнє",
			"es": "Regreso al futuro",
		},
		Descs: map[string]string{
			"en": "Marty McFly is accidentally sent thirty years into the past in a time-traveling DeLorean invented by scientist Doc Brown.",
			"ru": "Марти Макфлай попадает из 1985 года в 1955-й на машине времени, созданной эксцентричным Доком Брауном.",
			"uk": "Підліток Марті Макфлай випадково повертається в 1955 рік на машині часу Делоріан.",
			"es": "Marty McFly es enviado accidentalmente treinta años al pasado en un DeLorean que viaja en el tiempo.",
		},
	},
	{
		Category:    "movie",
		ReleaseYear: "2008",
		Rating:      9,
		Director:    "Christopher Nolan",
		PosterURL:   "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
		Genre: map[string]string{
			"en": "Action, Crime, Drama",
			"ru": "Боевик, Криминал, Драма",
			"uk": "Бойовик, Кримінал, Драма",
			"es": "Acción, Crimen, Drama",
		},
		Titles: map[string]string{
			"en": "The Dark Knight",
			"ru": "Темный рыцарь",
			"uk": "Темний лицар",
			"es": "El caballero oscuro",
		},
		Descs: map[string]string{
			"en": "When the menace known as the Joker wreaks havoc on Gotham, Batman must face one of the greatest psychological tests.",
			"ru": "Бэтмен вступает в психологическое и физическое противостояние с гениальным криминальным психопатом Джокером.",
			"uk": "Бетмен вступає в протистояння з кримінальним генієм Джокером, який занурює Готем у хаос.",
			"es": "Cuando la amenaza del Joker causa estragos en Gotham, Batman debe enfrentar su mayor prueba.",
		},
	},

	// 📺 TV SERIES (Favorites)
	{
		Category:    "show",
		ReleaseYear: "2008",
		Rating:      10,
		Director:    "Vince Gilligan",
		Seasons:     5,
		Episodes:    62,
		PosterURL:   "https://image.tmdb.org/t/p/w500/ztIm5BD70WwP32nF931XhPq2s6.jpg",
		Genre: map[string]string{
			"en": "Crime, Drama",
			"ru": "Криминал, Драма",
			"uk": "Кримінал, Драма",
			"es": "Crimen, Drama",
		},
		Titles: map[string]string{
			"en": "Breaking Bad",
			"ru": "Во все тяжкие",
			"uk": "Пуститися берега",
			"es": "Breaking Bad",
		},
		Descs: map[string]string{
			"en": "A chemistry teacher diagnosed with cancer turns to manufacturing methamphetamine with a former student to secure his family's future.",
			"ru": "Учитель химии Уолтер Уайт узнает о смертельном диагнозе и начинает производить метамфетамин ради финансовой независимости семьи.",
			"uk": "Учитель хімії Волтер Уайт дізнається про смертельну хворобу і вирішує зайнятися виробництвом метамфетаміну.",
			"es": "Un profesor de química diagnosticado con cáncer recurre a la fabricación de metanfetamina para su familia.",
		},
	},
	{
		Category:    "show",
		ReleaseYear: "2011",
		Rating:      9,
		Seasons:     8,
		Episodes:    73,
		PosterURL:   "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1j1uTh.jpg",
		Genre: map[string]string{
			"en": "Fantasy, Drama",
			"ru": "Фэнтези, Драма",
			"uk": "Фентезі, Драма",
			"es": "Fantasía, Drama",
		},
		Titles: map[string]string{
			"en": "Game of Thrones",
			"ru": "Игра престолов",
			"uk": "Гра престолів",
			"es": "Juego de tronos",
		},
		Descs: map[string]string{
			"en": "Noble families fight for control over the lands of Westeros, while an ancient enemy returns after being dormant for millennia.",
			"ru": "Великие дома Вестероса сражаются за Железный Трон, не замечая приближения древнего зла с Севера.",
			"uk": "Шляхетні родини Вестероса змагаються за контроль над Залізним Троном.",
			"es": "Familias nobles luchan por el control del Reino de Poniente mientras un antiguo enemigo regresa.",
		},
	},
	{
		Category:    "show",
		ReleaseYear: "2016",
		Rating:      9,
		Seasons:     4,
		Episodes:    34,
		PosterURL:   "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
		Genre: map[string]string{
			"en": "Sci-Fi, Horror",
			"ru": "Научная фантастика, Ужасы",
			"uk": "Наукова фантастика, Жахи",
			"es": "Ciencia ficción, Terror",
		},
		Titles: map[string]string{
			"en": "Stranger Things",
			"ru": "Очень странные дела",
			"uk": "Дивні дива",
			"es": "Stranger Things",
		},
		Descs: map[string]string{
			"en": "When a young boy vanishes, a small town uncovers a mystery involving secret experiments and supernatural forces.",
			"ru": "В тихом городке Хоукинс исчезает мальчик, раскрывая тайну правительственных экспериментов и изнаночного мира.",
			"uk": "У містечку Гокінс зникає хлопчик, що призводить до розкриття таємничих експериментів та потойбічних сил.",
			"es": "Cuando un niño desaparece, un pequeño pueblo descubre un misterio que involucra experimentos secretos.",
		},
	},
	{
		Category:    "show",
		ReleaseYear: "2019",
		Rating:      10,
		Director:    "Johan Renck",
		Seasons:     1,
		Episodes:    5,
		PosterURL:   "https://image.tmdb.org/t/p/w500/hlLXt2tOPT6RRYXBhsnjuG2uvv2.jpg",
		Genre: map[string]string{
			"en": "Drama, History",
			"ru": "Драма, История",
			"uk": "Драма, Історія",
			"es": "Drama, Historia",
		},
		Titles: map[string]string{
			"en": "Chernobyl",
			"ru": "Чернобыль",
			"uk": "Чорнобиль",
			"es": "Chernobyl",
		},
		Descs: map[string]string{
			"en": "In April 1986, an explosion erupted at the Chernobyl nuclear power station. This series follows the stories of the liquidators.",
			"ru": "Хроника катастрофы на Чернобыльской АЭС в 1986 году и подвиг людей, упредивших еще большую трагедию.",
			"uk": "Драматична історія про аварію на Чорнобильській АЕС у 1986 році та ліквідаторів, які рятували світ.",
			"es": "La historia del desastre nuclear de Chernóbil en 1986 y los hombres y mujeres que sacrificaron todo.",
		},
	},
	{
		Category:    "show",
		ReleaseYear: "2005",
		Rating:      9,
		Seasons:     9,
		Episodes:    201,
		PosterURL:   "https://image.tmdb.org/t/p/w500/3n2D2859LUg8qScRTuLGl0W7aTG.jpg",
		Genre: map[string]string{
			"en": "Comedy",
			"ru": "Комедия",
			"uk": "Комедія",
			"es": "Comedia",
		},
		Titles: map[string]string{
			"en": "The Office",
			"ru": "Офис",
			"uk": "Офіс",
			"es": "The Office",
		},
		Descs: map[string]string{
			"en": "A mockumentary on a group of typical office workers, where the workday consists of ego clashes and hilarious tedium.",
			"ru": "Комедийный псевдодокументальный сериал о веселой трудовой повседневности работников бумажной компании.",
			"uk": "Кумедний комедійний серіал про щоденне життя офісних працівників компанії Dunder Mifflin.",
			"es": "Un falso documental sobre un grupo de trabajadores de oficina típicos y su peculiar gerente.",
		},
	},

	// 📚 BOOKS (Unsorted / Неразобранное)
	{
		Category:    "book",
		ReleaseYear: "1949",
		Rating:      9,
		Author:      "George Orwell",
		PosterURL:   "https://m.media-amazon.com/images/I/71kxa1-0mfL._AC_UF1000,1000_QL80_.jpg",
		Genre: map[string]string{
			"en": "Dystopian, Sci-Fi",
			"ru": "Антиутопия, Фантастика",
			"uk": "Антиутопія, Фантастика",
			"es": "Distopía, Ciencia ficción",
		},
		Titles: map[string]string{
			"en": "1984",
			"ru": "1984",
			"uk": "1984",
			"es": "1984",
		},
		Descs: map[string]string{
			"en": "A dystopian social science fiction novel and cautionary tale about the dangers of totalitarianism.",
			"ru": "Знаменитый роман-антиутопия о тоталитарном государстве, Старшем Брате и уничтожении свободы мысли.",
			"uk": "Культовий роман-антиутопія Джорджа Орвелла про тоталітарне суспільство та контроль над особистістю.",
			"es": "Una novela de ciencia ficción distópica sobre los peligros del totalitarismo.",
		},
	},
	{
		Category:    "book",
		ReleaseYear: "1943",
		Rating:      10,
		Author:      "Antoine de Saint-Exupéry",
		PosterURL:   "https://m.media-amazon.com/images/I/71Ozy5bLtRL._AC_UF1000,1000_QL80_.jpg",
		Genre: map[string]string{
			"en": "Fable, Fiction",
			"ru": "Притча, Сказка",
			"uk": "Притча, Казка",
			"es": "Fábula, Ficción",
		},
		Titles: map[string]string{
			"en": "The Little Prince",
			"ru": "Маленький принц",
			"uk": "Маленький принц",
			"es": "El principito",
		},
		Descs: map[string]string{
			"en": "A young prince visits various planets, addressing themes of loneliness, friendship, love, and loss.",
			"ru": "Мудрая притча о дружбе, любви, ответственности и умении видеть главное сердцем.",
			"uk": "Поетична та зворушлива казка-притча про дружбу, любов та відповідальність за тих, кого приручили.",
			"es": "Un joven príncipe visita varios planetas abordando temas de soledad, amistad, amor y pérdida.",
		},
	},
	{
		Category:    "book",
		ReleaseYear: "1997",
		Rating:      9,
		Author:      "J.K. Rowling",
		PosterURL:   "https://m.media-amazon.com/images/I/81q77Q39nEL._AC_UF1000,1000_QL80_.jpg",
		Genre: map[string]string{
			"en": "Fantasy, Adventure",
			"ru": "Фэнтези, Приключения",
			"uk": "Фентезі, Пригоди",
			"es": "Fantasía, Aventuras",
		},
		Titles: map[string]string{
			"en": "Harry Potter and the Sorcerer's Stone",
			"ru": "Гарри Поттер и философский камень",
			"uk": "Гаррі Поттер і філософський камінь",
			"es": "Harry Potter y la piedra filosofal",
		},
		Descs: map[string]string{
			"en": "An orphaned boy discovers he is a wizard and is invited to attend Hogwarts School of Witchcraft and Wizardry.",
			"ru": "Мальчик-сирота Гарри Поттер узнает о своем волшебном даре и отправляется учиться в школу магии Хогвартс.",
			"uk": "Хлопчик-сирота Гаррі Поттер дізнається про свій магічний дар і вирушає на навчання до школи Гоґвортс.",
			"es": "Un niño huérfano descubre que es un mago y asistirá a la Escuela Hogwarts de Magia y Hechicería.",
		},
	},
	{
		Category:    "book",
		ReleaseYear: "1954",
		Rating:      10,
		Author:      "J.R.R. Tolkien",
		PosterURL:   "https://m.media-amazon.com/images/I/71jLBXtWJWL._AC_UF1000,1000_QL80_.jpg",
		Genre: map[string]string{
			"en": "Fantasy, Epic",
			"ru": "Эпическое фэнтези",
			"uk": "Епічне фентезі",
			"es": "Fantasía épica",
		},
		Titles: map[string]string{
			"en": "The Lord of the Rings",
			"ru": "Властелин колец",
			"uk": "Володар перснів",
			"es": "El Señor de los Anillos",
		},
		Descs: map[string]string{
			"en": "The epic high-fantasy quest to destroy the One Ring and defeat the Dark Lord Sauron.",
			"ru": "Великое эпическое путешествие по Средиземью с целью уничтожить Кольцо Всевластья в огне Ородруина.",
			"uk": "Епічна трилогія про боротьбу добра і зла в Середзем'ї та знищення Персня Всевладдя.",
			"es": "La épica novela de fantasía sobre la misión de destruir el Anillo Único y derrotar a Sauron.",
		},
	},
	{
		Category:    "book",
		ReleaseYear: "1965",
		Rating:      9,
		Author:      "Frank Herbert",
		PosterURL:   "https://m.media-amazon.com/images/I/81ym3QUd3KL._AC_UF1000,1000_QL80_.jpg",
		Genre: map[string]string{
			"en": "Sci-Fi, Epic",
			"ru": "Научная фантастика",
			"uk": "Наукова фантастика",
			"es": "Ciencia ficción",
		},
		Titles: map[string]string{
			"en": "Dune",
			"ru": "Дюна",
			"uk": "Дюна",
			"es": "Dune",
		},
		Descs: map[string]string{
			"en": "Paul Atreides leads nomadic tribes in a battle to control the desert planet Arrakis and its valuable spice.",
			"ru": "Захватывающая история о политике, религии и выживании на пустынной планете Арракис.",
			"uk": "Історія Пола Атріда на пустельній планеті Арракіс, де видобувають найцінніший ресурс у всесвіті.",
			"es": "Paul Atreides lidera a tribus en una batalla para controlar el planeta desértico Arrakis.",
		},
	},

	// 🎮 GAMES (Unsorted / Неразобранное)
	{
		Category:    "game",
		ReleaseYear: "2015",
		Rating:      10,
		PosterURL:   "https://image.tmdb.org/t/p/w500/87x19M25L3L40x1k4aFp3K0p7A0.jpg",
		Genre: map[string]string{
			"en": "RPG, Adventure",
			"ru": "Ролевая игра, Приключения",
			"uk": "Рольова гра, Пригоди",
			"es": "RPG, Aventura",
		},
		Titles: map[string]string{
			"en": "The Witcher 3: Wild Hunt",
			"ru": "Ведьмак 3: Дикая Охота",
			"uk": "Відьмак 3: Дикий Гін",
			"es": "The Witcher 3: Wild Hunt",
		},
		Descs: map[string]string{
			"en": "Geralt of Rivia, a monster hunter for hire, embarks on an epic quest to find the Child of Prophecy.",
			"ru": "Ведьмак Геральт отправляется в масштабное путешествие по Континенту в поисках дитя предназначения.",
			"uk": "Відьмак Ґеральт із Рівії вирушає у масштабну подорож у пошуках Цірі, дитини з пророцтва.",
			"es": "Geralt de Rivia, un cazador de monstruos a sueldo, se embarca en una búsqueda épica.",
		},
	},
	{
		Category:    "game",
		ReleaseYear: "2011",
		Rating:      9,
		PosterURL:   "https://m.media-amazon.com/images/I/61Wf-xRkSLL._AC_UF1000,1000_QL80_.jpg",
		Genre: map[string]string{
			"en": "Sandbox, Survival",
			"ru": "Песочница, Выживание",
			"uk": "Пісочниця, Виживання",
			"es": "Sandbox, Supervivencia",
		},
		Titles: map[string]string{
			"en": "Minecraft",
			"ru": "Minecraft",
			"uk": "Minecraft",
			"es": "Minecraft",
		},
		Descs: map[string]string{
			"en": "Explore infinite blocky worlds and build everything from simple homes to grand castles.",
			"ru": "Культовая игра-песочница с бесконечным кубическим миром для строительства и исследований.",
			"uk": "Культова гра-пісочниця, де гравці досліджують кубічний світ, будують та виживають.",
			"es": "Explora mundos infinitos de bloques y construye todo lo que puedas imaginar.",
		},
	},
	{
		Category:    "game",
		ReleaseYear: "2018",
		Rating:      10,
		PosterURL:   "https://image.tmdb.org/t/p/w500/9e0Tz3Z7h8G783Zk8395gH.jpg",
		Genre: map[string]string{
			"en": "Action, Open World",
			"ru": "Боевик, Открытый мир",
			"uk": "Бойовик, Відкритий світ",
			"es": "Acción, Mundo abierto",
		},
		Titles: map[string]string{
			"en": "Red Dead Redemption 2",
			"ru": "Red Dead Redemption 2",
			"uk": "Red Dead Redemption 2",
			"es": "Red Dead Redemption 2",
		},
		Descs: map[string]string{
			"en": "Arthur Morgan and the Van der Linde gang are outlaws on the run across America at the turn of the century.",
			"ru": "Грандиозная история бандита Артура Моргана и банды Датча ван дер Линде на закате Дикого Запада.",
			"uk": "Захоплива історія про Артура Моргана та банду Ван дер Лінде на тлі занепаду епохи Дикого Заходу.",
			"es": "Arthur Morgan y la banda de Van der Linde son forajidos en fuga a través de América.",
		},
	},
	{
		Category:    "game",
		ReleaseYear: "2013",
		Rating:      9,
		PosterURL:   "https://image.tmdb.org/t/p/w500/5vH8s97zX7A8b7k8z.jpg",
		Genre: map[string]string{
			"en": "Action, Open World",
			"ru": "Боевик, Открытый мир",
			"uk": "Бойовик, Відкритий світ",
			"es": "Acción, Mundo abierto",
		},
		Titles: map[string]string{
			"en": "Grand Theft Auto V",
			"ru": "Grand Theft Auto V",
			"uk": "Grand Theft Auto V",
			"es": "Grand Theft Auto V",
		},
		Descs: map[string]string{
			"en": "A street hustler, a retired bank robber, and a psychopath commit a series of dangerous heists in Los Santos.",
			"ru": "История трех грабителей, проворачивающих серию опаснейших ограблений в солнечной Калифорнии.",
			"uk": "Історія трьох грабіжників, які здійснюють серію зухвалих пограбувань у сонячному Лос-Сантосі.",
			"es": "Un estafador, un ladrón retirado y un psicópata cometen una serie de peligrosos atracos.",
		},
	},
	{
		Category:    "game",
		ReleaseYear: "2011",
		Rating:      10,
		PosterURL:   "https://m.media-amazon.com/images/I/81hV4fP-HBL._AC_UF1000,1000_QL80_.jpg",
		Genre: map[string]string{
			"en": "Puzzle, Sci-Fi",
			"ru": "Головоломка, Фантастика",
			"uk": "Головоломка, Фантастика",
			"es": "Puzles, Ciencia ficción",
		},
		Titles: map[string]string{
			"en": "Portal 2",
			"ru": "Portal 2",
			"uk": "Portal 2",
			"es": "Portal 2",
		},
		Descs: map[string]string{
			"en": "Chell solves spatial puzzles with the Portal Gun in the ruined Aperture Science facility.",
			"ru": "Шедевральная пространственная головоломка с портальной пушкой в разрушенном комплексе Aperture.",
			"uk": "Шедевральна головоломка з портальною гарматою та чорним гумором у лабораторіях Aperture Science.",
			"es": "Chell resuelve puzles espaciales con la pistola de portales en las ruinas de Aperture Science.",
		},
	},
}

// NormalizeLang converts any language string to one of "uk", "en", "es", "ru"
func NormalizeLang(langCode string) string {
	l := strings.ToLower(strings.TrimSpace(langCode))
	if strings.HasPrefix(l, "uk") || strings.HasPrefix(l, "ua") {
		return "uk"
	}
	if strings.HasPrefix(l, "es") {
		return "es"
	}
	if strings.HasPrefix(l, "en") {
		return "en"
	}
	if strings.HasPrefix(l, "ru") {
		return "ru"
	}
	return "ru" // Default fallback language
}

// SeedInitialUserData creates 20 initial seed items for a new user physically in their language
func SeedInitialUserData(ctx context.Context, database *db.DB, userID int64, langCode string) error {
	if database == nil || database.Pool == nil {
		return fmt.Errorf("database is nil")
	}

	lang := NormalizeLang(langCode)
	favItemIDs := make([]string, 0, 10)

	log.Printf("[Seed] Seeding 20 initial items for user %d in language '%s'", userID, lang)

	for idx, item := range defaultSeedItems {
		itemUUID := uuid.New().String()

		title := item.Titles[lang]
		if title == "" {
			title = item.Titles["en"]
		}

		desc := item.Descs[lang]
		if desc == "" {
			desc = item.Descs["en"]
		}

		genre := item.Genre[lang]
		if genre == "" {
			genre = item.Genre["en"]
		}

		// First 10 items (5 movies + 5 series) go into Favorites
		isFavoriteItem := idx < 10
		if isFavoriteItem {
			favItemIDs = append(favItemIDs, itemUUID)
		}

		query := `
			INSERT INTO items (
				id, user_id, title, category, status, rating, genre, release_year,
				poster_url, description, director, author, seasons, episodes_total,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, 'planned', $5, $6, $7,
				$8, $9, $10, $11, $12, $13,
				CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
			) ON CONFLICT (id) DO NOTHING;
		`

		_, err := database.Pool.Exec(
			ctx, query,
			itemUUID, userID, title, item.Category, item.Rating, genre, item.ReleaseYear,
			item.PosterURL, desc, item.Director, item.Author, item.Seasons, item.Episodes,
		)

		if err != nil {
			log.Printf("[Seed] Failed to insert seed item '%s' for user %d: %v", title, userID, err)
		}
	}

	// Update user's lists_data JSONB column to include 10 Favorites items
	type UserList struct {
		ID        string   `json:"id"`
		Name      string   `json:"name"`
		IsDefault bool     `json:"isDefault"`
		ItemIDs   []string `json:"itemIds"`
		CreatedAt string   `json:"createdAt"`
		FolderID  string   `json:"folderId"`
	}

	favListName := "Избранное"
	switch lang {
	case "uk":
		favListName = "Улюблене"
	case "en":
		favListName = "Favorites"
	case "es":
		favListName = "Favoritos"
	}

	favList := UserList{
		ID:        "favorites",
		Name:      favListName,
		IsDefault: true,
		ItemIDs:   favItemIDs,
		CreatedAt: time.Now().Format(time.RFC3339),
		FolderID:  "misc",
	}

	listsJSON, err := json.Marshal([]UserList{favList})
	if err == nil {
		_, errUpdate := database.Pool.Exec(
			ctx,
			"UPDATE users SET lists_data = $1 WHERE id = $2 AND (lists_data IS NULL OR lists_data = '[]'::jsonb OR lists_data = 'null'::jsonb)",
			listsJSON, userID,
		)
		if errUpdate != nil {
			log.Printf("[Seed] Warning updating lists_data for user %d: %v", userID, errUpdate)
		}
	}

	return nil
}
