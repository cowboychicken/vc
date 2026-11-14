import { PALETTE, type ColorId, type Profile, cleanName, isColorId } from "../net/protocol";

const KEY = "vc13.profile";

// Each is at most MAX_NAME_LENGTH characters (tests/profile.test.ts checks).
export const FUNNY_NAMES = [
  "Sir Honks", "Dr Waffles", "Mr Pickles", "Captain Moo", "Big Noodle", "Lady Toast", "Count Quack",
  "Sock Puppet", "Taco Tuesday", "Gravy Boat", "Wobbly Bob", "Prof Pie", "Disco Duck", "Sneaky Pete",
  "Banana Hat", "Cheese Wiz", "Lil Biscuit", "Baron Bagel", "Mango Tango", "Pudding Cup",
  "Nacho Mama", "Turbo Llama", "Jelly Bean", "Sir Loin", "Pickle Rick", "Grumpy Goat", "Fuzzy Wuzzy",
  "Moose Juice", "Salty Dog", "Rubber Ducky", "Tater Tot", "Zesty Zed", "Mac N Cheese", "Meatball",
];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

/** A name and colour kept on this device. There are no accounts. A first visit gets a random funny name. */
export function loadProfile(): Profile {
  let name = "";
  let color: ColorId | null = null;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    name = cleanName(raw.name);
    color = isColorId(raw.color) ? raw.color : null;
  } catch {
    // unreadable; start fresh
  }
  const profile = { name: name || pick(FUNNY_NAMES), color: color ?? randomColor() };
  if (name === "" || color === null) saveProfile(profile);
  return profile;
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // storage unavailable; the profile just won't be remembered
  }
}

function randomColor(): ColorId {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]!.id;
}
