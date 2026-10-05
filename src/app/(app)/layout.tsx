import { requireFreelancer } from "@/lib/auth";

export default async function FreelancerLayout({ children }: LayoutProps<"/">) {
  await requireFreelancer();
  return children;
}
