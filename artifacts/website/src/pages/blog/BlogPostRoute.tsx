import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BlogPost from "./BlogPost";

const blogQueryClient = new QueryClient();

export default function BlogPostRoute() {
  return (
    <QueryClientProvider client={blogQueryClient}>
      <BlogPost />
    </QueryClientProvider>
  );
}
