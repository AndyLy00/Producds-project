type Entity = { id: string; updatedAt: number; deleted?: boolean };
type Profile<Store, Template, Recipe, Category, Settings> = {
  stores: Store[];
  templates: Template[];
  recipes: Recipe[];
  categories: Category[];
  settings: Settings;
};

export function mergeEntities<T extends Entity>(mine: T[] | undefined, theirs: T[] | undefined): T[];
export function mergeList<T extends Entity & { items: Entity[] }>(mine: T, theirs: T): T;
export function mergeLists<T extends Entity & { items: Entity[] }>(mine: T[] | undefined, theirs: T[] | undefined): T[];
export function mergeProfile<
  Store extends Entity,
  Template extends Entity,
  Recipe extends Entity,
  Category extends Entity,
  Settings extends { updatedAt: number },
>(
  mine: Profile<Store, Template, Recipe, Category, Settings>,
  theirs: Profile<Store, Template, Recipe, Category, Settings>,
): Profile<Store, Template, Recipe, Category, Settings>;

export const TOMBSTONE_LIFETIME: number;
export function dropOldTombstones<T extends Entity>(entities: T[] | undefined, now?: number): T[];
export function pruneList<T extends Entity & { items: Entity[] }>(list: T, now?: number): T;
export function pruneProfile<
  Store extends Entity,
  Template extends Entity,
  Recipe extends Entity,
  Category extends Entity,
  Settings extends { updatedAt: number },
>(profile: Profile<Store, Template, Recipe, Category, Settings>, now?: number): Profile<Store, Template, Recipe, Category, Settings>;
