import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BlogList from "./BlogList";

const blogQueryClient = new QueryClient();

export default function BlogListRoute() {
  return (
    <QueryClientProvider client={blogQueryClient}>
      <BlogList />
    </QueryClientProvider>
  );
}
