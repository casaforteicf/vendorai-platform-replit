import { useLocation } from "wouter";
import HotelSectorNav from "./HotelSectorNav";
import RestaurantModulesNav from "./RestaurantModulesNav";

const RESTAURANT_PREFIXES = [
  "/hotelaria/restaurante",
  "/hotelaria/ab",
  "/hotelaria/receitas",
  "/hotelaria/planejamento",
];

export default function HotelModulesNav() {
  const [location] = useLocation();
  const restaurant = RESTAURANT_PREFIXES.some((prefix) => location === prefix || location.startsWith(`${prefix}/`));
  return restaurant ? <RestaurantModulesNav /> : <HotelSectorNav />;
}
