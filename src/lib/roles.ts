import type { RoleCategory } from "@/types/database";

// Mirrors the seed data in supabase/migrations/20260801000000_init_schema.sql.
// Keep the two in sync if the taxonomy changes.
export const ROLES: { slug: string; label: string; category: RoleCategory }[] = [
  { slug: "director-of-photography", label: "Director of Photography (DP)", category: "regional" },
  { slug: "camera-operator", label: "Camera Operator", category: "on-location" },
  { slug: "gaffer", label: "Gaffer", category: "on-location" },
  { slug: "grip", label: "Grip", category: "on-location" },
  { slug: "audio-sound-mixer", label: "Audio / Sound Mixer", category: "on-location" },
  { slug: "drone-aerial-operator", label: "Drone / Aerial Operator", category: "regional" },
  { slug: "editor", label: "Editor", category: "remote" },
  { slug: "colorist", label: "Colorist", category: "remote" },
  { slug: "motion-vfx", label: "Motion / VFX", category: "remote" },
  { slug: "producer", label: "Producer", category: "regional" },
  { slug: "production-assistant", label: "Production Assistant (PA)", category: "on-location" },
];
