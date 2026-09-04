import { motion } from "framer-motion";

const NICHE_VISUALS = [
  {
    src: "/niches/materials.jpg",
    alt: "Atendimento em loja de materiais de construção",
  },
  {
    src: "/niches/insurance.jpg",
    alt: "Atendimento em corretora de seguros",
  },
  {
    src: "/niches/pools.jpg",
    alt: "Atendimento especializado em piscinas",
  },
  {
    src: "/niches/windows.jpg",
    alt: "Equipe trabalhando em fábrica de esquadrias",
  },
  {
    src: "/niches/autoparts.jpg",
    alt: "Atendimento em distribuidora de autopeças",
  },
] as const;

export default function NicheVisualShowcase() {
  return (
    <section className="border-t border-white/10 bg-[#070b14] py-16 text-white md:py-20">
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-9 max-w-2xl text-center md:mb-12">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-orange-400">
            Feito para operações reais
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] md:text-4xl">
            VendorAI no seu mercado.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {NICHE_VISUALS.map((item, index) => (
            <motion.figure
              key={item.src}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
              className={`group overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03] shadow-[0_20px_55px_rgba(0,0,0,0.22)] ${
                index < 2 ? "lg:col-span-3" : "lg:col-span-2"
              }`}
            >
              <img
                src={item.src}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                width={320}
                height={180}
                className="aspect-video h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"
              />
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
