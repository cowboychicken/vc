import { PALETTE, type ColorId, type Profile, isColorId } from "../net/protocol";

const KEY = "vc13.profile";

/** A name and colour kept on this device. There are no accounts. */
export function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const name = typeof raw.name === "string" ? raw.name : "";
    if (isColorId(raw.color)) return { name, color: raw.color };
    return { name, color: randomColor() };
  } catch {
    return { name: "", color: randomColor() };
  }
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
