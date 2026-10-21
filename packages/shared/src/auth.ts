import * as z from "zod";

export const Credentials = z
  .object({
    email: z.email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .meta({ id: "Credentials" });
export type Credentials = z.input<typeof Credentials>;

export const PublicUser = z
  .object({
    id: z.uuid(),
    email: z.email(),
  })
  .meta({ id: "User" });
export type PublicUser = z.infer<typeof PublicUser>;

export const UserResponse = z.object({ user: PublicUser }).meta({ id: "UserResponse" });
export type UserResponse = z.infer<typeof UserResponse>;
