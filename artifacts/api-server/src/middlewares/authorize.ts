import { type Request, type Response, type NextFunction } from "express";

export function authorize(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Request & { user?: { platformRole?: string } }).user;
    if (!user) {
      res.status(401).json({ error: "Não autenticado" });
      return;
    }
    const role = user.platformRole ?? "employee";
    if (!allowedRoles.includes(role)) {
      res.status(403).json({ error: "Acesso negado para esta função" });
      return;
    }
    next();
  };
}
