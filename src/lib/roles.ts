import type { RoleCategory } from "@/types/database";

export interface Role {
  slug: string;
  label: string;
  category: RoleCategory;
  /** UI bucket. Mirrors roles.role_group in the database. */
  group: string;
}

// Mirrors the seed data in supabase/migrations/20260801000000_init_schema.sql.
// Keep the two in sync if the taxonomy changes.
export const ROLES: Role[] = [
  // Camera
  { slug: "director-of-photography", label: "Director of Photography (DP)", category: "regional", group: "Camera" },
  { slug: "camera-operator", label: "Camera Operator", category: "on-location", group: "Camera" },
  { slug: "second-shooter", label: "2nd Shooter / Second Camera", category: "on-location", group: "Camera" },
  { slug: "eng-run-and-gun-shooter", label: "ENG / Run-and-Gun Shooter", category: "on-location", group: "Camera" },
  { slug: "photographer", label: "Photographer", category: "on-location", group: "Camera" },
  { slug: "dit", label: "DIT (Digital Imaging Technician)", category: "on-location", group: "Camera" },
  { slug: "drone-aerial-operator", label: "Drone / Aerial Operator (Part 107)", category: "regional", group: "Camera" },

  // Lighting & Grip
  { slug: "gaffer", label: "Gaffer", category: "on-location", group: "Lighting & Grip" },
  { slug: "grip", label: "Grip", category: "on-location", group: "Lighting & Grip" },

  // Audio
  { slug: "sound-mixer", label: "Sound Mixer / Audio Engineer", category: "on-location", group: "Audio" },
  { slug: "voiceover-artist", label: "Voiceover Artist", category: "remote", group: "Audio" },

  // Production
  { slug: "producer", label: "Producer", category: "regional", group: "Production" },
  { slug: "production-assistant", label: "Production Assistant (PA)", category: "on-location", group: "Production" },
  { slug: "teleprompter-operator", label: "Teleprompter Operator", category: "on-location", group: "Production" },
  { slug: "livestream-broadcast-technician", label: "Livestream / Broadcast Technician", category: "on-location", group: "Production" },

  // Post-Production
  { slug: "editor", label: "Editor", category: "remote", group: "Post-Production" },
  { slug: "social-vertical-video-editor", label: "Social / Vertical Video Editor", category: "remote", group: "Post-Production" },
  { slug: "colorist", label: "Colorist", category: "remote", group: "Post-Production" },
  { slug: "motion-graphics-vfx", label: "Motion Graphics / VFX Designer", category: "remote", group: "Post-Production" },

  // Talent & Creative
  { slug: "on-camera-host", label: "On-Camera Host / Talent", category: "on-location", group: "Talent & Creative" },
  { slug: "hair-makeup-artist", label: "Hair / Makeup Artist (HMUA)", category: "on-location", group: "Talent & Creative" },
  { slug: "scriptwriter", label: "Scriptwriter", category: "remote", group: "Talent & Creative" },

  // Full-Service
  { slug: "full-service-production", label: "Full-Service Production", category: "regional", group: "Full-Service" },
  { slug: "shooter-editor", label: "Shooter-Editor / One-Person Band", category: "regional", group: "Full-Service" },
];

export const ROLE_BY_SLUG = new Map(ROLES.map((role) => [role.slug, role]));

/** Display order for role groups, for UI bucketing. */
export const ROLE_GROUPS = [
  "Camera",
  "Lighting & Grip",
  "Audio",
  "Production",
  "Post-Production",
  "Talent & Creative",
  "Full-Service",
] as const;

export const ROLES_BY_GROUP: { group: string; roles: Role[] }[] = ROLE_GROUPS.map((group) => ({
  group,
  roles: ROLES.filter((role) => role.group === group),
}));
