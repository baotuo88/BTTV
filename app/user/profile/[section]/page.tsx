import { notFound } from "next/navigation";
import {
  UserProfileContent,
  type UserProfileMode,
} from "@/components/user/UserProfileContent";

interface ProfileSectionPageProps {
  params: Promise<{ section: string }>;
}

const SECTION_TO_MODE: Record<string, UserProfileMode> = {
  account: "account",
  security: "security",
  favorite: "favorite",
  follow: "follow",
  "watch-later": "watch_later",
  progress: "progress",
};

export default async function ProfileSectionPage({
  params,
}: ProfileSectionPageProps) {
  const { section } = await params;
  const mode = SECTION_TO_MODE[section];
  if (!mode) {
    notFound();
  }

  return <UserProfileContent mode={mode} />;
}
