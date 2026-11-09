import {
  Award,
  BookMarked,
  BookOpenText,
  CalendarCheck,
  FileSpreadsheet,
  GraduationCap,
  Headphones,
  IdCard,
  LayoutDashboard,
  Receipt,
  Newspaper,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth";

export interface NavItem {
  href: string;
  /** Key in messages/ar.json → nav.* */
  label: string;
  /** Different label for teachers (e.g. "إملاءاتي"). */
  teacherLabel?: string;
  icon: LucideIcon;
  roles: Role[];
  /** Not built yet: shown greyed out with a "soon" badge. */
  soon?: boolean;
  /** Sidebar section (key in nav.groups.*); none = top of the list. */
  group?: NavGroup;
}

export type NavGroup = "teaching" | "people" | "finance" | "site" | "admin";


const ALL: Role[] = ["ADMIN", "STAFF", "TEACHER"];
const OFFICE: Role[] = ["ADMIN", "STAFF"];

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "dashboard", icon: LayoutDashboard, roles: ALL },
  { href: "/classes", label: "classes", teacherLabel: "myClasses", icon: BookOpenText, roles: ALL, group: "teaching" },
  { href: "/attendance", label: "attendance", icon: CalendarCheck, roles: ALL, group: "teaching" },
  { href: "/hifz", label: "hifz", icon: BookMarked, roles: ALL, group: "teaching" },
  { href: "/evaluations", label: "evaluations", icon: Award, roles: ALL, group: "teaching" },
  { href: "/mushaf", label: "mushaf", icon: Headphones, roles: ALL, group: "teaching" },
  { href: "/students", label: "students", icon: Users, roles: OFFICE, group: "people" },
  { href: "/teachers", label: "teachers", icon: GraduationCap, roles: OFFICE, group: "people" },
  { href: "/imports", label: "imports", icon: FileSpreadsheet, roles: OFFICE, group: "people" },
  { href: "/payments", label: "payments", icon: Wallet, roles: OFFICE, group: "finance" },
  { href: "/fees", label: "fees", icon: Receipt, roles: OFFICE, group: "finance" },
  { href: "/memberships", label: "memberships", icon: IdCard, roles: OFFICE, group: "finance" },
  { href: "/news-admin", label: "news", icon: Newspaper, roles: OFFICE, group: "site" },
  { href: "/users", label: "users", icon: UserCog, roles: ["ADMIN"], group: "admin" },
  { href: "/settings", label: "settings", icon: Settings, roles: ["ADMIN"], group: "admin" },
];

export const navFor = (role: Role) => NAV.filter((item) => item.roles.includes(role));

/** The role's items split into sidebar sections, in menu order. */
export function navSections(role: Role) {
  const sections: { group?: NavGroup; items: NavItem[] }[] = [];
  for (const item of navFor(role)) {
    const last = sections.at(-1);
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  }
  return sections;
}

/** The phone tab bar: what each role reaches for most during a session. */
const TAB_BAR: Record<"office" | "teacher", string[]> = {
  office: ["/dashboard", "/students", "/attendance", "/payments"],
  teacher: ["/dashboard", "/classes", "/attendance", "/hifz"],
};
export const tabBarFor = (role: Role) =>
  TAB_BAR[role === "TEACHER" ? "teacher" : "office"].map((href) => NAV.find((i) => i.href === href)!);

/** The menu item a path belongs to. */
export const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);
