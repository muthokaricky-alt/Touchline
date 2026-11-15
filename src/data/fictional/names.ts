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
};

/** Nations that foreign players are drawn from. */
export const FOREIGN_NATIONS: readonly NationCode[] = ['ESP', 'FRA', 'NED'];
