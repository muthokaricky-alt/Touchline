import type { NationCode } from '../schemas';

/**
 * Name pools for generated players, by nationality. Common first names and
 * surnames combined at random; not based on any real player list.
 */
export type NamePool = { firstNames: readonly string[]; lastNames: readonly string[] };

export const NAME_POOLS: Readonly<Record<string, NamePool>> = {
  ENG: {
    firstNames: [
      'Tom', 'Jack', 'Harry', 'Callum', 'Liam', 'Owen', 'Ryan', 'Ben',
      'Josh', 'Danny', 'Sam', 'Luke', 'Alfie', 'Reece', 'Kieran', 'Joe',
    ],
    lastNames: [
      'Hartley', 'Ashworth', 'Pemberton', 'Collins', 'Marsh', 'Fletcher', 'Whitfield', 'Barlow',
      'Kendrick', 'Holloway', 'Rowe', 'Sutton', 'Thornton', 'Bradley', 'Lowther', 'Garside',
      'Mercer', 'Haywood', 'Dunmore', 'Calloway',
    ],
  },
  ESP: {
    firstNames: [
      'Javier', 'Pablo', 'Sergio', 'Adrián', 'Marcos', 'Iker', 'Raúl', 'Diego',
      'Álvaro', 'Hugo', 'Daniel', 'Rubén', 'Óscar', 'Mario', 'Unai', 'Nacho',
    ],
    lastNames: [
      'Moreno', 'Castillo', 'Navarro', 'Ortega', 'Serrano', 'Vidal', 'Delgado', 'Prieto',
      'Calvo', 'Molina', 'Herrera', 'Cabrera', 'Gallardo', 'Ibáñez', 'Pastor', 'Lozano',
      'Medina', 'Aguilar', 'Rivas', 'Soler',
    ],
  },
  FRA: {
    firstNames: [
      'Hugo', 'Lucas', 'Théo', 'Mathis', 'Enzo', 'Clément', 'Bastien', 'Yanis',
      'Maxime', 'Julien', 'Rayan', 'Antoine', 'Nathan', 'Florian', 'Kylian', 'Romain',
    ],
    lastNames: [
      'Lefèvre', 'Moreau', 'Girard', 'Bonnet', 'Rousseau', 'Fournier', 'Mercier', 'Lambert',
      'Faure', 'Chevalier', 'Gautier', 'Perrin', 'Morel', 'Dumont', 'Blanc', 'Garnier',
      'Roux', 'Marchand', 'Brun', 'Vasseur',
    ],
  },
  NED: {
    firstNames: [
      'Daan', 'Sem', 'Bram', 'Luuk', 'Jesse', 'Thijs', 'Milan', 'Ruben',
      'Stijn', 'Joris', 'Koen', 'Niels', 'Lars', 'Wout', 'Teun', 'Sven',
    ],
    lastNames: [
      'de Groot', 'Bakker', 'Visser', 'Smit', 'Mulder', 'van Dijkhuis', 'Brouwer', 'Kuiper',
      'Hendriks', 'Dekker', 'Vos', 'Willems', 'Postma', 'Jonker', 'van Leeuwen', 'Kok',
      'Verhoeven', 'Prins', 'Huisman', 'Schouten',
    ],
  },
  KEN: {
    firstNames: [
      'Brian', 'Kevin', 'Dennis', 'Victor', 'Collins', 'Felix', 'Eric', 'Michael',
      'Joseph', 'Duncan', 'Kelvin', 'Allan', 'Clifton', 'Teddy', 'Benson', 'Austin',
    ],
    lastNames: [
      'Otieno', 'Ochieng', 'Odhiambo', 'Wekesa', 'Wanjala', 'Mwangi', 'Kamau', 'Njoroge',
      'Kiprotich', 'Cheruiyot', 'Mutua', 'Musyoka', 'Omondi', 'Juma', 'Barasa', 'Simiyu',
      'Nyamweya', 'Oduya', 'Kariuki', 'Langat',
    ],
  },
  GER: {
    firstNames: [
      'Lukas', 'Jonas', 'Leon', 'Felix', 'Niklas', 'Tim', 'Jan', 'Moritz',
      'Paul', 'Finn', 'Erik', 'Julian', 'Tobias', 'Simon', 'Max', 'Fabian',
    ],
    lastNames: [
      'Becker', 'Hoffmann', 'Schulz', 'Krause', 'Wagner', 'Braun', 'Vogel', 'Keller',
      'Frank', 'Lehmann', 'Hartmann', 'Brandt', 'Lorenz', 'Seidel', 'Winkler', 'Bauer',
      'Kühn', 'Engel', 'Pohl', 'Ziegler',
    ],
  },
  ITA: {
    firstNames: [
      'Luca', 'Marco', 'Alessandro', 'Matteo', 'Lorenzo', 'Davide', 'Simone', 'Andrea',
      'Riccardo', 'Federico', 'Gabriele', 'Nicolò', 'Tommaso', 'Stefano', 'Pietro', 'Fabio',
    ],
    lastNames: [
      'Rossi', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino',
      'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano',
      'Rizzo', 'Lombardi', 'Moretti', 'Barbieri',
    ],
  },
  POR: {
    firstNames: [
      'João', 'Tiago', 'Rui', 'Diogo', 'Pedro', 'Nuno', 'André', 'Gonçalo',
      'Rafael', 'Bruno', 'Hugo', 'Miguel', 'Duarte', 'Filipe', 'Vasco', 'Luís',
    ],
    lastNames: [
      'Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins',
      'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Alves', 'Ribeiro',
      'Pinto', 'Carvalho', 'Teixeira', 'Moreira',
    ],
  },
  NGA: {
    firstNames: [
      'Chinedu', 'Emeka', 'Tunde', 'Ifeanyi', 'Segun', 'Uche', 'Chidi', 'Kelechi',
      'Obinna', 'Femi', 'Ahmed', 'Musa', 'Daniel', 'Samuel', 'Victor', 'Peter',
    ],
    lastNames: [
      'Okafor', 'Adeyemi', 'Nwosu', 'Balogun', 'Eze', 'Okonkwo', 'Ibrahim', 'Adebayo',
      'Chukwu', 'Olawale', 'Bello', 'Nnamdi', 'Obi', 'Akinola', 'Ogunleye', 'Umeh',
      'Danjuma', 'Onyeka', 'Afolabi', 'Ekwueme',
    ],
  },
  GHA: {
    firstNames: [
      'Kwame', 'Kofi', 'Kwabena', 'Yaw', 'Kojo', 'Kwaku', 'Fiifi', 'Ebo',
      'Isaac', 'Emmanuel', 'Daniel', 'Richard', 'Samuel', 'Prince', 'Joseph', 'Abdul',
    ],
    lastNames: [
      'Mensah', 'Owusu', 'Boateng', 'Asante', 'Osei', 'Appiah', 'Agyeman', 'Amoah',
      'Darko', 'Ofori', 'Addo', 'Badu', 'Danso', 'Frimpong', 'Gyan', 'Kumi',
      'Opoku', 'Quaye', 'Tetteh', 'Yeboah',
    ],
  },
  UGA: {
    firstNames: [
      'Ivan', 'Brian', 'Joseph', 'Moses', 'Denis', 'Allan', 'Isaac', 'Geoffrey',
      'Patrick', 'Ronald', 'Henry', 'Emmanuel', 'Paul', 'Robert', 'Joel', 'Martin',
    ],
    lastNames: [
      'Okello', 'Mukasa', 'Ssempijja', 'Kato', 'Waiswa', 'Nsubuga', 'Ochan', 'Lubega',
      'Mugisha', 'Byaruhanga', 'Tumusiime', 'Kizza', 'Ssali', 'Opio', 'Kiggundu', 'Muwanga',
      'Atuhaire', 'Wasswa', 'Nakibinge', 'Kasozi',
    ],
  },
  TAN: {
    firstNames: [
      'Juma', 'Hamisi', 'Rashidi', 'Saidi', 'Abdallah', 'Omari', 'Bakari', 'Salum',
      'Ally', 'Hassani', 'Ibrahimu', 'Shabani', 'Ramadhani', 'Faraji', 'Daudi', 'Musa',
    ],
    lastNames: [
      'Mwakyusa', 'Kibwana', 'Mrisho', 'Shaban', 'Mbwana', 'Ngowi', 'Massawe', 'Kimaro',
      'Mollel', 'Mushi', 'Lyimo', 'Swai', 'Temba', 'Mfinanga', 'Kombo', 'Mapunda',
      'Nyoni', 'Chande', 'Mkude', 'Lukumay',
    ],
  },
};

/**
 * Nations that foreign players are drawn from at ENGLISH clubs. Don't change
 * it: generation picks from this list, so a different list would rename and
 * reshuffle every existing player (and invalidate saves).
 */
export const FOREIGN_NATIONS: readonly NationCode[] = ['ESP', 'FRA', 'NED'];

/** Where foreign players come from at clubs in other countries (added with the foreign leagues). */
export const FOREIGN_NATIONS_BY_COUNTRY: Readonly<Record<string, readonly NationCode[]>> = {
  KEN: ['UGA', 'TAN', 'NGA', 'GHA'],
  FRA: ['ESP', 'POR', 'GHA', 'NGA', 'ITA'],
  GER: ['NED', 'POR', 'ITA', 'FRA', 'GHA'],
  ITA: ['ESP', 'FRA', 'POR', 'NGA', 'GER'],
  ESP: ['POR', 'FRA', 'ITA', 'NED', 'NGA'],
  NED: ['GER', 'ENG', 'GHA'],
  POR: ['ESP', 'NGA', 'FRA'],
  NGA: ['GHA', 'KEN'],
  GHA: ['NGA', 'KEN'],
  UGA: ['KEN', 'TAN'],
  TAN: ['KEN', 'UGA'],
};
