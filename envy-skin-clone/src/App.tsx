/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, ChangeEvent } from "react";
import { 
  ShoppingBag, 
  Menu, 
  Search,
  Star, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Truck, 
  ShieldCheck, 
  ArrowRight,
  Droplets,
  Sparkles,
  Zap,
  Moon,
  Sun,
  Flame,
  Instagram,
  Facebook,
  Mail,
  CreditCard,
  Copy,
  Check,
  QrCode,
  MapPin,
  User,
  Phone,
  FileText,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { extractPixFromFruitfyPayload, pickOrderUuidForApi } from "./pixExtract";
import { parseResponseJson } from "./parseResponseJson";
import { mergeUrlParamsFromLocation, toFruitfyUtmPayload } from "./urlParams";

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const centsFromBRL = (value: number) => Math.round(value * 100);

const formatCep = (digits: string) => {
  const d = digits.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const formatCpf = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

/** Valida CPF brasileiro (11 dígitos + dígitos verificadores). */
const isValidCpf = (digits: string): boolean => {
  const d = onlyDigits(digits);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]!, 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(d[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]!, 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  return rest === parseInt(d[10]!, 10);
};

const formatPhoneBr = (digits: string) => {
  const d = digits.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length === 0) return `(${ddd}) `;
  if (d.length <= 6) return `(${ddd}) ${rest}`;
  if (d.length <= 10) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
};

const inputMaskedClass =
  "w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] focus:ring-2 focus:ring-[#7B61FF]/15 transition-all text-sm tabular-nums tracking-wide text-[#4C1D95] placeholder:text-[#C4B8D4]";

const inputMaskedErrorClass =
  "w-full px-4 py-3 rounded-xl border border-red-400 bg-[#FDFDFF] focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 transition-all text-sm tabular-nums tracking-wide text-[#4C1D95] placeholder:text-[#C4B8D4]";

interface OrderBump {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
}

const ORDER_BUMPS: OrderBump[] = [
  {
    id: "bump-envy-hair-stick",
    name: "Envy Hair Stick Anti-Frizz",
    description: "Adicione este cuidado extra com valor promocional exclusivo no checkout.",
    price: 29.9,
    image: "https://i.ibb.co/m5Gtd1wC/image.png",
  },
  {
    id: "bump-roll-on-olheiras",
    name: "Bastão Roll-on Clareador de Olheiras",
    description: "Aproveite a oferta especial para completar seu ritual de cuidados.",
    price: 37.9,
    image: "https://i.ibb.co/tMkhqVGJ/image.png",
  },
];

// --- Checkout Components ---

const CheckoutHeader = () => (
  <header className="bg-white py-4 border-b border-[#F5F3FF] sticky top-0 z-50">
    <div className="max-w-5xl mx-auto px-4 flex items-center justify-between">
      <div className="h-6">
        <img 
          src="https://i.ibb.co/Kcb9fST2/image.png" 
          alt="Envy Skin Logo" 
          className="h-full w-auto object-contain"
          referrerPolicy="no-referrer"
        />
      </div>
      <div className="flex items-center gap-2 text-[#4C1D95] font-bold text-sm uppercase tracking-wider">
        <ShieldCheck size={18} className="text-[#7B61FF]" />
        Checkout Seguro
      </div>
    </div>
  </header>
);

const Checkout = ({ kit, onBack, onFinish }: { kit: any, onBack: () => void, onFinish: (data: any) => Promise<void> }) => {
  const [step, setStep] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [shipping, setShipping] = useState<'free' | 'sedex'>('free');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [address, setAddress] = useState({
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });
  const [customer, setCustomer] = useState({
    name: '',
    email: '',
    cpf: '',
    phone: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedOrderBumps, setSelectedOrderBumps] = useState<string[]>([]);
  const orderBumps: OrderBump[] = [
    ...ORDER_BUMPS,
    {
      id: "bump-produto-principal-extra",
      name: `${kit.name} Extra com Desconto`,
      description: "Leve mais uma unidade do produto principal por apenas R$ 21,90.",
      price: 21.9,
      image: kit.image,
    },
  ];

  const handleCepChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const digits = onlyDigits(e.target.value).slice(0, 8);
    const formatted = formatCep(digits);
    setAddress((prev) => ({ ...prev, cep: formatted }));

    if (digits.length < 8) {
      setCepError(null);
      return;
    }

    setCepLoading(true);
    setCepError(null);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await response.json();
      if (data.erro) {
        setCepError("CEP não encontrado. Verifique os números.");
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: "",
          neighborhood: "",
          city: "",
          state: "",
        }));
      } else {
        setCepError(null);
        setAddress((prev) => ({
          ...prev,
          cep: formatted,
          street: data.logradouro ?? "",
          neighborhood: data.bairro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        }));
      }
    } catch (error) {
      console.error("Erro ao buscar CEP", error);
      setCepError("Não foi possível validar o CEP. Tente de novo.");
    } finally {
      setCepLoading(false);
    }
  };

  const cepDigits = onlyDigits(address.cep);
  const cpfDigits = onlyDigits(customer.cpf);
  const cpfInvalid = cpfDigits.length === 11 && !isValidCpf(cpfDigits);

  const subtotal = kit.price * quantity;
  const shippingPrice = shipping === 'sedex' ? 19.45 : 0;
  const orderBumpsTotal = orderBumps
    .filter((bump) => selectedOrderBumps.includes(bump.id))
    .reduce((sum, bump) => sum + bump.price, 0);
  const total = subtotal + shippingPrice + orderBumpsTotal;
  
  const toggleOrderBump = (id: string) => {
    setSelectedOrderBumps((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };
  
  const handleSubmitOrder = async () => {
    setSubmitError(null);
    const requiredFieldsFilled =
      customer.name.trim() &&
      customer.email.trim() &&
      customer.cpf.trim() &&
      customer.phone.trim();

    if (!requiredFieldsFilled) {
      setSubmitError("Preencha nome, e-mail, CPF e telefone para continuar.");
      return;
    }

    if (cpfDigits.length !== 11) {
      setSubmitError("Informe o CPF completo (11 dígitos).");
      return;
    }
    if (!isValidCpf(customer.cpf)) {
      setSubmitError("O CPF informado é inválido.");
      return;
    }

    if (cepDigits.length !== 8) {
      setSubmitError("Informe o CEP completo (8 dígitos).");
      return;
    }
    if (cepError) {
      setSubmitError("Corrija o CEP antes de finalizar o pedido.");
      return;
    }

    setSubmitting(true);
    try {
      await onFinish({ total, customer, address, shipping, quantity, orderBumpsTotal });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Não foi possível gerar o PIX.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFF] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-[#9B89B3] text-sm mb-8 hover:text-[#7B61FF] transition-colors"
        >
          <ChevronLeft size={16} />
          Voltar para a loja
        </button>

        <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
          {/* Form Section */}
          <div className="space-y-6">
            {/* Dados Pessoais */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F5F3FF] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F5F3FF] pb-4">
                <div className="w-10 h-10 bg-[#F5F3FF] rounded-full flex items-center justify-center text-[#7B61FF]">
                  <User size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#4C1D95]">Dados Pessoais</h2>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Nome Completo</label>
                  <input 
                    type="text" 
                    placeholder="Seu nome completo"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={customer.name}
                    onChange={e => setCustomer({...customer, name: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">E-mail</label>
                  <input 
                    type="email" 
                    placeholder="seu@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={customer.email}
                    onChange={e => setCustomer({...customer, email: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">CPF</label>
                  <input 
                    type="text" 
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className={cpfInvalid ? inputMaskedErrorClass : inputMaskedClass}
                    value={customer.cpf}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        cpf: formatCpf(onlyDigits(e.target.value)),
                      })
                    }
                  />
                  {cpfInvalid && (
                    <p className="text-xs text-red-600 font-medium">CPF inválido. Confira os números.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Celular / WhatsApp</label>
                  <input 
                    type="tel" 
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className={inputMaskedClass}
                    value={customer.phone}
                    onChange={(e) =>
                      setCustomer({
                        ...customer,
                        phone: formatPhoneBr(onlyDigits(e.target.value)),
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Entrega */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F5F3FF] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F5F3FF] pb-4">
                <div className="w-10 h-10 bg-[#F5F3FF] rounded-full flex items-center justify-center text-[#7B61FF]">
                  <MapPin size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#4C1D95]">Dados de Entrega</h2>
              </div>
              
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">CEP</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      inputMode="numeric"
                      autoComplete="postal-code"
                      placeholder="00000-000"
                      maxLength={9}
                      className={cepError ? inputMaskedErrorClass : inputMaskedClass}
                      value={address.cep}
                      onChange={handleCepChange}
                    />
                    {cepLoading && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#7B61FF] border-t-transparent rounded-full animate-spin"></div>}
                  </div>
                  {cepError && (
                    <p className="text-xs text-red-600 font-medium">{cepError}</p>
                  )}
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Endereço</label>
                  <input 
                    type="text" 
                    placeholder="Rua, Avenida..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={address.street}
                    onChange={e => setAddress({...address, street: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Número</label>
                  <input 
                    type="text" 
                    placeholder="123"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={address.number}
                    onChange={e => setAddress({...address, number: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Complemento</label>
                  <input 
                    type="text" 
                    placeholder="Apto, Bloco..."
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={address.complement}
                    onChange={e => setAddress({...address, complement: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Bairro</label>
                  <input 
                    type="text" 
                    placeholder="Bairro"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={address.neighborhood}
                    onChange={e => setAddress({...address, neighborhood: e.target.value})}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Cidade</label>
                  <input 
                    type="text" 
                    placeholder="Cidade"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={address.city}
                    onChange={e => setAddress({...address, city: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Estado</label>
                  <input 
                    type="text" 
                    placeholder="UF"
                    className="w-full px-4 py-3 rounded-xl border border-[#F5F3FF] bg-[#FDFDFF] focus:outline-none focus:border-[#7B61FF] transition-colors text-sm"
                    value={address.state}
                    onChange={e => setAddress({...address, state: e.target.value})}
                  />
                </div>
              </div>

              {cepDigits.length === 8 && !cepLoading && !cepError && (
                <div className="space-y-4 pt-4 border-t border-[#F5F3FF]">
                  <label className="text-xs font-bold text-[#4C1D95] uppercase tracking-wider">Escolha o Frete</label>
                  <div className="grid gap-3">
                    <button 
                      onClick={() => setShipping('free')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'free' ? 'border-[#7B61FF] bg-[#F5F3FF]' : 'border-[#F5F3FF] hover:border-[#EBE9FE]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'free' ? 'border-[#7B61FF]' : 'border-[#9B89B3]'}`}>
                          {shipping === 'free' && <div className="w-2.5 h-2.5 bg-[#7B61FF] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#4C1D95] text-sm">Frete Grátis</p>
                          <p className="text-xs text-[#9B89B3]">7 a 10 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#7B61FF] text-sm">Grátis</span>
                    </button>
                    <button 
                      onClick={() => setShipping('sedex')}
                      className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left ${shipping === 'sedex' ? 'border-[#7B61FF] bg-[#F5F3FF]' : 'border-[#F5F3FF] hover:border-[#EBE9FE]'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${shipping === 'sedex' ? 'border-[#7B61FF]' : 'border-[#9B89B3]'}`}>
                          {shipping === 'sedex' && <div className="w-2.5 h-2.5 bg-[#7B61FF] rounded-full" />}
                        </div>
                        <div>
                          <p className="font-bold text-[#4C1D95] text-sm">SEDEX Express</p>
                          <p className="text-xs text-[#9B89B3]">2 a 3 dias úteis</p>
                        </div>
                      </div>
                      <span className="font-bold text-[#4C1D95] text-sm">R$ 19,45</span>
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Pagamento */}
            <section className="bg-white p-6 sm:p-8 rounded-3xl border border-[#F5F3FF] shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b border-[#F5F3FF] pb-4">
                <div className="w-10 h-10 bg-[#F5F3FF] rounded-full flex items-center justify-center text-[#7B61FF]">
                  <Zap size={20} />
                </div>
                <h2 className="text-lg font-bold text-[#4C1D95]">Pagamento</h2>
              </div>
              
              <div className="p-4 rounded-2xl border-2 border-[#7B61FF] bg-[#F5F3FF] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#7B61FF] shadow-sm">
                    <Zap size={20} fill="currentColor" />
                  </div>
                  <div>
                    <p className="font-bold text-[#4C1D95] text-sm">PIX</p>
                    <p className="text-xs text-[#9B89B3]">Aprovação imediata</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-[#9B89B3] text-center italic">
                O código PIX será gerado após a finalização do pedido.
              </p>
              <div className="space-y-3">
                {orderBumps.map((bump) => {
                  const isSelected = selectedOrderBumps.includes(bump.id);
                  return (
                    <button
                      key={bump.id}
                      type="button"
                      onClick={() => toggleOrderBump(bump.id)}
                      className={`w-full text-left rounded-2xl border p-3 transition-all ${
                        isSelected
                          ? "border-[#7B61FF] bg-[#F5F3FF]"
                          : "border-[#F5F3FF] bg-white hover:border-[#EBE9FE]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={bump.image}
                            alt={bump.name}
                            className="w-14 h-14 rounded-xl object-cover border border-[#F5F3FF]"
                          />
                          <div>
                            <p className="text-sm font-bold text-[#4C1D95]">{bump.name}</p>
                            <p className="text-xs text-[#9B89B3] mt-1">{bump.description}</p>
                          </div>
                        </div>
                        <span className="text-sm font-black text-[#7B61FF] whitespace-nowrap">
                          + R$ {bump.price.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Summary Section */}
          <div className="lg:sticky lg:top-28 space-y-6">
            <section className="bg-white p-6 rounded-3xl border border-[#F5F3FF] shadow-lg space-y-6">
              <h2 className="text-lg font-bold text-[#4C1D95] border-b border-[#F5F3FF] pb-4">Resumo do Pedido</h2>
              
              <div className="flex gap-4">
                <div className="w-20 h-20 bg-[#F5F3FF] rounded-xl overflow-hidden flex-shrink-0 border border-[#F5F3FF]">
                  <img src={kit.image} alt={kit.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 space-y-1">
                  <h3 className="font-bold text-[#4C1D95] text-sm leading-tight">{kit.name} Envy Skin</h3>
                  <p className="text-xs text-[#9B89B3]">Tratamento Premium</p>
                  
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex items-center border border-[#F5F3FF] rounded-lg overflow-hidden">
                      <button 
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="px-2 py-1 hover:bg-[#F5F3FF] text-[#7B61FF] transition-colors"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <span className="px-3 py-1 text-xs font-bold text-[#4C1D95] border-x border-[#F5F3FF] min-w-[32px] text-center">
                        {quantity}
                      </span>
                      <button 
                        onClick={() => setQuantity(quantity + 1)}
                        className="px-2 py-1 hover:bg-[#F5F3FF] text-[#7B61FF] transition-colors"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                    <p className="font-bold text-[#4C1D95] text-sm">R$ {subtotal.toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-[#F5F3FF]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#9B89B3]">Subtotal</span>
                  <span className="text-[#4C1D95] font-medium">R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#9B89B3]">Frete</span>
                  <span className="text-[#7B61FF] font-bold">{shippingPrice > 0 ? `R$ ${shippingPrice.toFixed(2).replace('.', ',')}` : 'GRÁTIS'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#9B89B3]">Adicionais</span>
                  <span className="text-[#4C1D95] font-medium">R$ {orderBumpsTotal.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-[#F5F3FF]">
                  <span className="font-bold text-[#4C1D95]">Total</span>
                  <div className="text-right">
                    <p className="text-2xl font-black text-[#4C1D95]">R$ {total.toFixed(2).replace('.', ',')}</p>
                    <p className="text-[10px] text-[#9B89B3]">ou 12x de R$ {(total / 12).toFixed(2).replace('.', ',')}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className="w-full py-4 bg-[#7B61FF] text-white rounded-full font-bold hover:bg-[#4C1D95] transition-all shadow-lg shadow-purple-100 flex items-center justify-center gap-2 group"
              >
                {submitting ? "GERANDO PIX..." : "FINALIZAR PEDIDO"}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
              {submitError && (
                <p className="text-xs text-red-500 text-center">{submitError}</p>
              )}

              <div className="flex items-center justify-center gap-2 pt-4">
                <div className="flex items-center gap-1 text-[10px] font-bold text-[#4C1D95]">
                  <ShieldCheck size={12} className="text-[#7B61FF]" />
                  COMPRA SEGURA
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

const POST_PIX_PAID_REDIRECT_DEFAULT = "https://rastreiogummy.netlify.app/";
const POST_PIX_POLL_MS = 200;

const PixSuccess = ({ orderData, onReset }: { orderData: any, onReset: () => void }) => {
  const [copied, setCopied] = useState(false);
  const pixCode = orderData.pixCode;
  const qrCodeImage = orderData.qrCodeImage;
  const orderUuid =
    (typeof orderData.orderId === "string" && orderData.orderId) ||
    pickOrderUuidForApi(orderData.gatewayPayload);

  useEffect(() => {
    const redirectUrl =
      (import.meta.env.VITE_PIX_PAID_REDIRECT_URL as string | undefined)?.trim() ||
      POST_PIX_PAID_REDIRECT_DEFAULT;
    if (!orderUuid) return;

    let cancelled = false;
    let inFlight = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const started = Date.now();
    const maxMs = 2 * 60 * 60 * 1000;
    const terminalFail = new Set([
      "canceled",
      "cancelled",
      "refused",
      "failed",
      "refunded",
      "chargeback",
    ]);

    const stop = () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (Date.now() - started > maxMs) {
        stop();
        return;
      }
      inFlight = true;
      try {
        const r = await fetch(`/api/order/${encodeURIComponent(orderUuid)}`);
        const j = (await parseResponseJson(r)) as {
          data?: { status?: string };
        };
        if (cancelled) return;
        const status = typeof j?.data?.status === "string" ? j.data.status : "";
        if (status === "paid") {
          stop();
          window.location.replace(redirectUrl);
          return;
        }
        if (terminalFail.has(status)) stop();
      } catch {
        /* próximo ciclo */
      } finally {
        inFlight = false;
      }
    };

    intervalId = setInterval(tick, POST_PIX_POLL_MS);
    void tick();

    return () => {
      cancelled = true;
      stop();
    };
  }, [orderUuid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFF] pb-20">
      <CheckoutHeader />
      
      <main className="max-w-2xl mx-auto px-4 py-12 text-center space-y-8">
        <div className="space-y-4">
          <div className="w-20 h-20 bg-[#F5F3FF] rounded-full flex items-center justify-center text-[#7B61FF] mx-auto mb-6">
            <CheckCircle2 size={40} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#4C1D95]">Pedido Realizado com Sucesso!</h1>
          <p className="text-[#9B89B3] max-w-md mx-auto">
            Falta pouco! Realize o pagamento via PIX para que possamos enviar seu Envy Skin o quanto antes.
          </p>
          {orderUuid ? (
            <p className="text-xs text-[#7B61FF] font-medium max-w-md mx-auto">
              Aguardando confirmação do pagamento… você será redirecionado assim que o PIX for aprovado.
            </p>
          ) : (
            <p className="text-xs text-amber-700/90 max-w-md mx-auto">
              Não foi possível identificar o pedido para acompanhamento automático. Após pagar, guarde o comprovante.
            </p>
          )}
        </div>

        <div className="bg-white p-8 rounded-3xl border border-[#F5F3FF] shadow-xl space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-bold text-[#9B89B3] uppercase tracking-widest">Valor a pagar</p>
            <p className="text-4xl font-black text-[#4C1D95]">R$ {orderData.total.toFixed(2).replace('.', ',')}</p>
          </div>

          <div className="bg-[#F5F3FF] p-6 rounded-2xl inline-block border-2 border-[#EBE9FE]">
            {qrCodeImage ? (
              <img
                src={qrCodeImage.startsWith("data:") ? qrCodeImage : `data:image/png;base64,${qrCodeImage}`}
                alt="QR Code PIX"
                className="w-[180px] h-[180px] object-contain"
              />
            ) : (
              <QrCode size={180} className="text-[#4C1D95]" />
            )}
          </div>

          <div className="space-y-4">
            <p className="text-sm font-bold text-[#4C1D95]">Código PIX Copia e Cola</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                type="text" 
                readOnly 
                value={pixCode}
                className="flex-1 bg-[#FDFDFF] border border-[#F5F3FF] rounded-xl px-4 py-3 text-xs text-[#9B89B3] truncate"
              />
              <button 
                onClick={handleCopy}
                className="w-full sm:w-auto bg-[#7B61FF] text-white px-6 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#4C1D95] transition-all"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 text-left max-w-md mx-auto">
          <h3 className="font-bold text-[#4C1D95] flex items-center gap-2">
            <Clock size={18} className="text-[#7B61FF]" />
            Como pagar?
          </h3>
          <ol className="space-y-3 text-sm text-[#9B89B3]">
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F5F3FF] rounded-full flex items-center justify-center text-[10px] font-bold text-[#7B61FF] flex-shrink-0">1</span>
              Abra o app do seu banco e escolha a opção PIX.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F5F3FF] rounded-full flex items-center justify-center text-[10px] font-bold text-[#7B61FF] flex-shrink-0">2</span>
              Escaneie o QR Code ou cole o código acima.
            </li>
            <li className="flex gap-3">
              <span className="w-5 h-5 bg-[#F5F3FF] rounded-full flex items-center justify-center text-[10px] font-bold text-[#7B61FF] flex-shrink-0">3</span>
              Confirme os dados e finalize o pagamento.
            </li>
          </ol>
        </div>

        <button 
          onClick={onReset}
          className="text-[#9B89B3] text-sm font-medium hover:text-[#7B61FF] transition-colors pt-8"
        >
          Voltar para a página inicial
        </button>
      </main>
    </div>
  );
};


const AnnouncementBar = () => (
  <div className="bg-[#F5F3FF] text-[#7B61FF] text-[10px] py-2 px-4 text-center font-medium tracking-wider uppercase border-b border-[#EBE9FE]">
    FRETE GRÁTIS PARA TODO O BRASIL
  </div>
);

const Header = ({ cartCount }: { cartCount: number }) => {
  return (
    <header className="bg-white py-3 sm:py-4 border-b border-[#F5F3FF] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
        <button className="text-[#9B89B3] p-1">
          <Menu size={24} sm:size={28} strokeWidth={1.5} />
        </button>
        
        <div className="h-8 sm:h-10">
          <img 
            src="https://i.ibb.co/Kcb9fST2/image.png" 
            alt="Envy Skin Logo" 
            className="h-full w-auto object-contain"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button className="text-[#9B89B3] p-1">
            <Search size={20} sm:size={24} strokeWidth={1.5} />
          </button>
          <button className="relative text-[#9B89B3] p-1">
            <ShoppingBag size={20} sm:size={24} strokeWidth={1.5} />
            {cartCount > 0 && (
              <span className="absolute top-0 right-0 bg-[#7B61FF] text-white text-[8px] w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

const DarkHero = () => (
  <section className="bg-[#4C1D95] text-white py-12 sm:py-16 px-4 sm:px-6 text-center space-y-6 sm:space-y-8">
    <div className="flex items-center justify-center gap-4 sm:gap-8 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest opacity-80 pb-4 border-b border-white/10">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full animate-pulse" />
        Ativação Celular
      </div>
      <div className="flex items-center gap-2">
        <Sun size={12} sm:size={14} />
        Seguro para pele
      </div>
    </div>

    <div className="relative max-w-[280px] sm:max-w-sm mx-auto aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl">
      <img 
        src="https://i.ibb.co/fd4pWCPc/image.png" 
        alt="Woman sleeping" 
        className="w-full h-full object-cover"
        referrerPolicy="no-referrer"
      />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/grid-me.png')] opacity-20 mix-blend-overlay"></div>
    </div>

    <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
      Apague suas rugas, <br />
      enquanto dorme.
    </h2>

    <p className="text-sm leading-relaxed text-[#F5F3FF] text-center max-w-md mx-auto px-2">
      O <strong>Envy Skin</strong> é o sérum facial com <strong>nano ácido hialurônico de duplo peso molecular</strong>, 
      atua desde as mais superficiais até as mais profundas camadas da pele. Seu alto potencial de hidratação trata 
      as células da pele, além de estimular a produção de colágeno, promovendo a renovação celular
    </p>

    <div className="pt-2 sm:pt-4">
      <button 
        onClick={() => document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' })}
        className="w-full sm:w-auto bg-white text-[#4C1D95] px-6 sm:px-10 py-4 sm:py-5 rounded-full font-bold text-xs sm:text-sm shadow-xl active:scale-95 transition-transform"
      >
        Quero um olhar totalmente transformado!
      </button>
    </div>
  </section>
);

const SkinIssuesCarousel = () => {
  const issues = [
    { title: "Pés de galinha", img: "https://i.ibb.co/27tLYkFL/image.png" },
    { title: "Linhas da testa", img: "https://i.ibb.co/yB6x2v8Q/image.png" },
    { title: "Linhas de expressão", img: "https://i.ibb.co/LdrPYnbq/image.png" },
    { title: "Sulcos nasolabiais", img: "https://i.ibb.co/BVFMcVGc/image.png" },
    { title: "Rugas gravitacionais", img: "https://i.ibb.co/x86pGBJ5/image.png" },
  ];

  // Double the array for infinite effect
  const doubledIssues = [...issues, ...issues];
  const itemWidth = 160;
  const gap = 16;
  const totalDistance = (itemWidth + gap) * issues.length;

  return (
    <section className="bg-[#4C1D95] pb-12 overflow-hidden">
      <motion.div 
        className="flex gap-4 px-6"
        animate={{
          x: [0, -totalDistance],
        }}
        transition={{
          x: {
            repeat: Infinity,
            repeatType: "loop",
            duration: 20,
            ease: "linear",
          },
        }}
        style={{ width: "max-content" }}
      >
        {doubledIssues.map((issue, i) => (
          <div key={i} style={{ width: `${itemWidth}px` }} className="bg-white rounded-xl p-1.5 shadow-lg">
            <div className="aspect-square rounded-lg overflow-hidden mb-2">
              <img src={issue.img} alt={issue.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <p className="font-bold text-[#4C1D95] text-[11px] leading-tight px-1 pb-1 text-center">{issue.title}</p>
          </div>
        ))}
      </motion.div>
    </section>
  );
};

const LandingHero = () => (
  <section className="relative min-h-[80vh] sm:min-h-[90vh] flex items-center pt-12 sm:pt-20 pb-20 sm:pb-32 overflow-hidden bg-white">
    {/* Decorative elements */}
    <div className="absolute top-0 right-0 w-1/2 h-full bg-[#F5F3FF] -z-10 rounded-l-[100px] hidden lg:block"></div>
    <div className="absolute top-20 right-20 w-64 h-64 bg-[#7B61FF]/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
    
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="space-y-8 sm:space-y-12 text-center"
      >
        <div className="space-y-6 sm:space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#F5F3FF] rounded-full text-[10px] sm:text-xs font-bold text-[#7B61FF] uppercase tracking-widest mx-auto">
            <Sparkles size={14} /> Tecnologia NanoDelivery™
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold text-[#4C1D95] leading-[1.1] tracking-tight">
            Sua pele 10 anos <br />
            <span className="text-[#7B61FF]">mais jovem</span> <br className="hidden sm:block" />
            enquanto você dorme.
          </h1>
        </div>

        {/* Image moved below title */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="relative max-w-xl mx-auto px-4 sm:px-0"
        >
          <div className="relative z-10 rounded-[32px] sm:rounded-[40px] overflow-hidden shadow-[0_30px_60px_-15px_rgba(123,97,255,0.3)]">
            <img 
              src="https://i.ibb.co/5xjbMc6b/image.png" 
              alt="Pele Perfeita" 
              className="w-full h-auto object-cover max-h-[400px] sm:max-h-[500px]"
              referrerPolicy="no-referrer"
            />
          </div>
        </motion.div>
        
        <div className="space-y-8 sm:space-y-10">
          <p className="text-lg sm:text-xl text-[#9B89B3] max-w-2xl leading-relaxed mx-auto">
            O primeiro sérum com nano ácido hialurônico de duplo peso molecular que penetra 10x mais fundo para apagar rugas e linhas de expressão em tempo recorde.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={() => {
                document.getElementById('kits')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="bg-[#7B61FF] text-white px-8 sm:px-10 py-5 sm:py-6 rounded-full font-bold text-base sm:text-lg shadow-2xl shadow-purple-200 hover:bg-[#4C1D95] transition-all transform hover:scale-105 flex items-center justify-center gap-3 group mx-auto sm:mx-0"
            >
              QUERO MINHA TRANSFORMAÇÃO
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 pt-6 sm:pt-8 border-t border-[#F5F3FF] max-w-lg mx-auto">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white overflow-hidden bg-gray-100">
                  <img src={`https://randomuser.me/api/portraits/women/${i + 10}.jpg`} alt="User" referrerPolicy="no-referrer" />
                </div>
              ))}
            </div>
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex justify-center sm:justify-start text-[#7B61FF]">
                {[...Array(5)].map((_, i) => <Star key={i} size={14} fill="currentColor" stroke="none" />)}
              </div>
              <p className="text-[10px] sm:text-xs text-[#9B89B3] font-medium">+15.000 mulheres transformadas</p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

const Benefits = () => (
  <section id="beneficios" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#4C1D95] tracking-tight">
          O que o Envy Skin faz por você?
        </h2>
        <p className="text-sm sm:text-base text-[#9B89B3]">
          Uma fórmula completa desenvolvida para tratar todos os sinais do envelhecimento de forma simultânea.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
        {[
          { icon: <Sparkles />, title: "Reduz Rugas", desc: "Diminui a profundidade de rugas e linhas finas de expressão." },
          { icon: <Droplets />, title: "Clareia Manchas", desc: "Uniformiza o tom da pele e reduz marcas de acne e melasma." },
          { icon: <Zap />, title: "Firmeza Total", desc: "Estimula a produção natural de colágeno e elastina." },
          { icon: <CheckCircle2 />, title: "Textura Suave", desc: "Refina os poros e melhora a textura irregular da pele." },
        ].map((benefit, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="p-6 sm:p-8 rounded-2xl border border-[#F5F3FF] hover:border-[#7B61FF]/20 hover:shadow-xl transition-all group"
          >
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-[#F5F3FF] rounded-xl flex items-center justify-center text-[#7B61FF] mb-4 sm:mb-6 group-hover:bg-[#7B61FF] group-hover:text-white transition-colors">
              {benefit.icon}
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-[#4C1D95] mb-2 sm:mb-3">{benefit.title}</h3>
            <p className="text-[#9B89B3] leading-relaxed text-xs sm:text-sm">{benefit.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

const Technology = () => (
  <section id="tecnologia" className="py-12 sm:py-20 bg-[#4C1D95] text-white overflow-hidden">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        className="space-y-6 sm:space-y-8 text-center lg:text-left"
      >
        <div className="space-y-3 sm:space-y-4">
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            Tecnologia NanoDelivery™ <br />
            <span className="text-[#9B89B3]">Poder de absorção 10x maior.</span>
          </h2>
          <p className="text-[#F5F3FF]/80 text-base sm:text-lg leading-relaxed max-w-xl mx-auto lg:mx-0">
            Diferente dos séruns comuns que ficam na superfície, nossas nano-partículas 
            penetram nas camadas mais profundas da derme, entregando os ativos 
            diretamente onde a renovação celular acontece.
          </p>
        </div>

        <div className="grid gap-4 sm:gap-6 text-left max-w-md mx-auto lg:mx-0">
          {[
            "5% Nano Ácido Hialurônico de duplo peso molecular",
            "Retinol encapsulado para liberação prolongada",
            "Niacinamida pura para barreira cutânea",
            "Fórmula hipoalergênica e livre de parabenos"
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 sm:gap-4">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={12} sm:size={14} className="text-white" />
              </div>
              <span className="text-sm sm:text-base font-medium text-[#F5F3FF]">{item}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative px-4 sm:px-0"
      >
        <div className="aspect-square rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10">
          <img 
            src="https://i.ibb.co/kgdktymx/image.png" 
            alt="Nano Technology Illustration" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
      </motion.div>
    </div>
  </section>
);

const Ingredients = () => (
  <section id="ingredientes" className="py-12 sm:py-20 bg-[#F5F3FF]/30">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#4C1D95] tracking-tight">
          Ingredientes de Alta Performance
        </h2>
        <p className="text-sm sm:text-base text-[#9B89B3]">
          Uma seleção rigorosa de ativos puros e estabilizados para máxima eficácia.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
        {[
          { name: "Nano Ácido Hialurônico", desc: "Penetra profundamente para preencher rugas e hidratar de dentro para fora." },
          { name: "Retinol Encapsulado", desc: "Acelera a renovação celular sem causar a irritação do retinol comum." },
          { name: "Niacinamida (Vit B3)", desc: "Reduz a aparência dos poros e fortalece a barreira de proteção da pele." },
          { name: "Vitamina E Estabilizada", desc: "Poderoso antioxidante que protege contra o envelhecimento precoce." },
          { name: "Extrato de Algas Marinhas", desc: "Acalma a pele e promove uma hidratação mineralizante profunda." },
          { name: "Peptídeos Tensores", desc: "Promovem um efeito lifting imediato e duradouro na estrutura da pele." },
        ].map((item, i) => (
          <div key={i} className="bg-white p-6 sm:p-8 rounded-2xl border border-[#F5F3FF] hover:shadow-lg transition-all">
            <h4 className="text-base sm:text-lg font-bold text-[#7B61FF] mb-2">{item.name}</h4>
            <p className="text-xs sm:text-sm text-[#9B89B3] leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

const Kits = ({ onAddToCart }: { onAddToCart: (kit: any) => void }) => (
  <section id="kits" className="py-12 sm:py-20 bg-white">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="text-center mb-10 sm:mb-16 space-y-3 sm:space-y-4">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#4C1D95] tracking-tight">
          Escolha seu Kit e Comece sua Transformação
        </h2>
        <p className="text-sm sm:text-base text-[#9B89B3]">Economize comprando os kits de tratamento completo.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 sm:gap-12 lg:gap-8 items-center">
        {/* Kit 1 */}
        <div className="border border-[#F5F3FF] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 hover:shadow-xl transition-all">
          <p className="text-[10px] font-bold text-[#9B89B3] uppercase tracking-widest">Tratamento 1 Mês</p>
          <div className="w-40 h-40 sm:w-48 sm:h-48 bg-[#F5F3FF] rounded-2xl overflow-hidden">
            <img src="https://i.ibb.co/m5Gtd1wC/image.png" alt="Kit 1 Unidade" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-[#4C1D95]">1 Unidade</h3>
          <div className="space-y-1">
            <p className="text-[#9B89B3] line-through text-xs sm:text-sm">R$ 79,80</p>
            <p className="text-3xl sm:text-4xl font-bold text-[#4C1D95]">R$ 39,90</p>
            <p className="text-xs sm:text-sm text-[#9B89B3]">ou 12x de R$ 3,99</p>
          </div>
          <button onClick={() => onAddToCart({ id: 1, name: "1 Unidade", price: 39.90, image: "https://i.ibb.co/m5Gtd1wC/image.png" })} className="w-full py-4 bg-[#F5F3FF] text-[#7B61FF] rounded-full font-bold hover:bg-[#7B61FF] hover:text-white transition-all text-sm sm:text-base">
            COMPRAR AGORA
          </button>
        </div>

        {/* Kit 2 - Popular */}
        <div className="border-2 border-[#7B61FF] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 shadow-2xl relative sm:transform sm:scale-105 bg-white z-10">
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#7B61FF] text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest">
            Mais Vendido
          </div>
          <p className="text-[10px] font-bold text-[#4C1D95] uppercase tracking-widest">Tratamento 2 Meses</p>
          <div className="w-40 h-40 sm:w-48 sm:h-48 bg-[#F5F3FF] rounded-2xl overflow-hidden">
            <img src="https://i.ibb.co/tMkhqVGJ/image.png" alt="Kit 2 Unidades" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-[#4C1D95]">2 Unidades</h3>
          <div className="space-y-1">
            <p className="text-[#9B89B3] line-through text-xs sm:text-sm">R$ 139,80</p>
            <p className="text-3xl sm:text-4xl font-bold text-[#4C1D95]">R$ 69,90</p>
            <p className="text-xs sm:text-sm text-[#7B61FF] font-bold">Economia de R$ 69,90</p>
            <p className="text-xs sm:text-sm text-[#9B89B3]">ou 12x de R$ 6,99</p>
          </div>
          <button onClick={() => onAddToCart({ id: 2, name: "2 Unidades", price: 69.90, image: "https://i.ibb.co/tMkhqVGJ/image.png" })} className="w-full py-4 bg-[#7B61FF] text-white rounded-full font-bold hover:bg-[#4C1D95] transition-all shadow-lg shadow-purple-200 text-sm sm:text-base">
            APROVEITAR OFERTA
          </button>
        </div>

        {/* Kit 3 */}
        <div className="border border-[#F5F3FF] rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center space-y-6 hover:shadow-xl transition-all">
          <p className="text-[10px] font-bold text-[#9B89B3] uppercase tracking-widest">Tratamento 3 Meses</p>
          <div className="w-40 h-40 sm:w-48 sm:h-48 bg-[#F5F3FF] rounded-2xl overflow-hidden">
            <img src="https://i.ibb.co/60S1K1KV/image.png" alt="Kit 3 Unidades" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-[#4C1D95]">3 Unidades</h3>
          <div className="space-y-1">
            <p className="text-[#9B89B3] line-through text-xs sm:text-sm">R$ 199,80</p>
            <p className="text-3xl sm:text-4xl font-bold text-[#4C1D95]">R$ 99,90</p>
            <p className="text-xs sm:text-sm text-[#7B61FF] font-bold">50% de Desconto</p>
            <p className="text-xs sm:text-sm text-[#9B89B3]">ou 12x de R$ 9,99</p>
          </div>
          <button onClick={() => onAddToCart({ id: 3, name: "3 Unidades", price: 99.90, image: "https://i.ibb.co/60S1K1KV/image.png" })} className="w-full py-4 bg-[#F5F3FF] text-[#7B61FF] rounded-full font-bold hover:bg-[#7B61FF] hover:text-white transition-all text-sm sm:text-base">
            COMPRAR AGORA
          </button>
        </div>
      </div>
    </div>
  </section>
);

const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-12 sm:py-20 bg-[#F5F3FF]/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-4xl font-bold text-[#4C1D95] text-center mb-10 sm:mb-16 tracking-tight">
          Dúvidas Frequentes
        </h2>
        
        <div className="space-y-3 sm:space-y-4">
          {[
            { q: "Em quanto tempo vejo resultados?", a: "Os primeiros resultados de hidratação e luminosidade são visíveis em 7 dias. Para redução de rugas profundas, recomendamos o uso contínuo por pelo menos 30 a 60 dias." },
            { q: "Pode ser usado em peles oleosas?", a: "Sim! O Envy Skin possui textura sérum ultra-leve de rápida absorção, não obstrui os poros e ajuda a equilibrar a oleosidade através da niacinamida." },
            { q: "Tem contraindicações?", a: "Nossa fórmula é hipoalergênica e testada dermatologicamente. No entanto, gestantes e lactantes devem sempre consultar seu médico antes de iniciar o uso de produtos com retinol." },
            { q: "Como devo armazenar o produto?", a: "Mantenha em local fresco, seco e ao abrigo da luz solar direta para preservar a estabilidade dos ativos nanoencapsulados." },
          ].map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#F5F3FF] overflow-hidden">
              <button 
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full px-6 sm:px-8 py-5 sm:py-6 flex items-center justify-between text-left hover:bg-[#F5F3FF]/50 transition-colors"
              >
                <span className="font-bold text-[#4C1D95] text-sm sm:text-base pr-4">{item.q}</span>
                <ChevronDown className={`text-[#7B61FF] transition-transform flex-shrink-0 ${openIndex === i ? 'rotate-180' : ''}`} size={20} />
              </button>
              <motion.div 
                initial={false}
                animate={{ height: openIndex === i ? 'auto' : 0, opacity: openIndex === i ? 1 : 0 }}
                className="overflow-hidden"
              >
                <div className="px-6 sm:px-8 pb-6 sm:pb-8 text-xs sm:text-sm text-[#9B89B3] leading-relaxed">
                  {item.a}
                </div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Footer = () => (
  <footer className="bg-white pt-12 sm:pt-20 pb-24 sm:pb-12 border-t border-[#F5F3FF]">
    <div className="max-w-7xl mx-auto px-4 sm:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-12 mb-12 sm:mb-16">
        <div className="space-y-4 sm:space-y-6 text-center sm:text-left">
          <div className="h-8 sm:h-10 flex justify-center sm:justify-start">
            <img 
              src="https://i.ibb.co/Kcb9fST2/image.png" 
              alt="Envy Skin Logo" 
              className="h-full w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="text-xs sm:text-sm text-[#9B89B3] leading-relaxed">
            Redefinindo os padrões de skincare através da nanotecnologia e ciência avançada.
          </p>
          <div className="flex justify-center sm:justify-start gap-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F5F3FF] flex items-center justify-center text-[#7B61FF] hover:bg-[#7B61FF] hover:text-white transition-all cursor-pointer">
              <Instagram size={18} sm:size={20} />
            </div>
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#F5F3FF] flex items-center justify-center text-[#7B61FF] hover:bg-[#7B61FF] hover:text-white transition-all cursor-pointer">
              <Facebook size={18} sm:size={20} />
            </div>
          </div>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#4C1D95] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Navegação</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#9B89B3]">
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Início</li>
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Benefícios</li>
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Tecnologia</li>
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Kits</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#4C1D95] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Suporte</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#9B89B3]">
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Rastrear Pedido</li>
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Políticas de Envio</li>
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Trocas e Devoluções</li>
            <li className="hover:text-[#7B61FF] cursor-pointer transition-colors">Termos de Uso</li>
          </ul>
        </div>

        <div className="text-center sm:text-left">
          <h4 className="font-bold text-[#4C1D95] mb-4 sm:mb-6 text-sm sm:text-base uppercase tracking-widest">Contato</h4>
          <ul className="space-y-3 sm:space-y-4 text-xs sm:text-sm text-[#9B89B3]">
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <Mail size={16} className="text-[#7B61FF]" />
              sac@zencial.com.br
            </li>
            <li className="flex items-center justify-center sm:justify-start gap-3">
              <ShieldCheck size={16} className="text-[#7B61FF]" />
              Compra 100% Segura
            </li>
          </ul>
        </div>
      </div>

      <div className="pt-8 sm:pt-12 border-t border-[#F5F3FF] flex flex-col sm:flex-row justify-between items-center gap-6 sm:gap-8">
        <p className="text-[10px] sm:text-xs text-[#9B89B3] text-center sm:text-left">
          © 2024 Zencial. Todos os direitos reservados. CNPJ: 00.000.000/0001-00
        </p>
        <div className="flex gap-4 sm:gap-6 opacity-50 grayscale hover:grayscale-0 transition-all">
          <CreditCard size={24} sm:size={32} />
          <div className="text-[10px] sm:text-xs font-bold text-[#4C1D95]">VISA</div>
          <div className="text-[10px] sm:text-xs font-bold text-[#4C1D95]">MASTERCARD</div>
          <div className="text-[10px] sm:text-xs font-bold text-[#4C1D95]">PIX</div>
        </div>
      </div>
    </div>
  </footer>
);

// --- Main App ---

export default function App() {
  const [cartCount, setCartCount] = useState(0);
  const [view, setView] = useState<'landing' | 'checkout' | 'pix'>('landing');
  const [selectedKit, setSelectedKit] = useState<any>(null);
  const [orderData, setOrderData] = useState<any>(null);
  const [urlParams, setUrlParams] = useState<Record<string, string>>(() =>
    mergeUrlParamsFromLocation()
  );

  useEffect(() => {
    const sync = () => setUrlParams(mergeUrlParamsFromLocation());
    sync();
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, [view]);

  const handleAddToCart = (kitData: any) => {
    setSelectedKit(kitData);
    setView('checkout');
    window.scrollTo(0, 0);
  };

  const handleFinishOrder = async (data: any) => {
    const utmPayload = toFruitfyUtmPayload(urlParams);
    const response = await fetch("/api/pix/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.customer.name.trim(),
        email: data.customer.email.trim(),
        cpf: onlyDigits(data.customer.cpf),
        phone: onlyDigits(data.customer.phone),
        amount: centsFromBRL(data.total),
        quantity: data.quantity,
        orderBumpsValue: centsFromBRL(data.orderBumpsTotal ?? 0),
        utm: utmPayload,
      }),
    });

    const payload = (await parseResponseJson(response)) as {
      success?: boolean;
      message?: string;
    };

    if (!response.ok || payload?.success === false) {
      const message =
        payload?.message || "Não foi possível criar cobrança PIX na Fruitfy.";
      throw new Error(message);
    }

    const pixData = extractPixFromFruitfyPayload(payload);
    setOrderData({
      ...data,
      total: pixData.amount > 0 ? pixData.amount / 100 : data.total,
      pixCode: pixData.pixCode,
      qrCodeImage: pixData.qrCodeImage,
      orderId: pixData.orderId,
      gatewayPayload: pixData.raw,
    });
    setView('pix');
    window.scrollTo(0, 0);
  };

  if (view === 'checkout' && selectedKit) {
    return <Checkout kit={selectedKit} onBack={() => setView('landing')} onFinish={handleFinishOrder} />;
  }

  if (view === 'pix' && orderData) {
    return <PixSuccess orderData={orderData} onReset={() => setView('landing')} />;
  }

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-[#7B61FF] selection:text-white">
      <AnnouncementBar />
      <Header cartCount={cartCount} />
      
      <main>
        <LandingHero />
        
        <section className="py-8 bg-white border-y border-[#F5F3FF]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap justify-center items-center gap-8 sm:gap-16 opacity-40 grayscale">
            {["ANVISA", "CRUELTY FREE", "DERMATOLOGICAMENTE TESTADO", "HIPOALERGÊNICO"].map((logo, i) => (
              <span key={i} className="text-[10px] sm:text-xs font-black tracking-widest uppercase text-[#4C1D95]">{logo}</span>
            ))}
          </div>
        </section>

        <DarkHero />
        <SkinIssuesCarousel />

        <Benefits />
        <Technology />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="order-2 lg:order-1">
              <img 
                src="https://i.ibb.co/N8py19j/image.png" 
                alt="Molecular Synergy" 
                className="rounded-2xl sm:rounded-3xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="order-1 lg:order-2 space-y-4 sm:space-y-6 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#4C1D95] tracking-tight">
                Por que o Envy Skin funciona?
              </h2>
              <p className="text-sm sm:text-base text-[#9B89B3] leading-relaxed">
                Nossa fórmula utiliza o conceito de <strong>sinergia molecular</strong>, onde a combinação específica 
                de ativos produz resultados superiores à soma de seus efeitos individuais. 
              </p>
              <p className="text-sm sm:text-base text-[#9B89B3] leading-relaxed">
                O ácido hialurônico de baixo peso molecular cria canais de hidratação que potencializam 
                a penetração da niacinamida e do complexo peptídico. Estudos in vitro demonstraram 
                que esta combinação específica aumenta a eficácia dos ativos em até 64% quando comparada 
                à aplicação isolada.
              </p>
            </div>
          </div>
        </section>

        <Ingredients />
        
        <section className="py-12 sm:py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="space-y-6 sm:space-y-8 text-center lg:text-left">
              <h2 className="text-2xl sm:text-4xl font-bold text-[#4C1D95] tracking-tight">Modo de Usar</h2>
              <div className="space-y-6 sm:space-y-8 text-left">
                {[
                  { step: "01", title: "Limpeza", desc: "Lave o rosto com seu sabonete facial de preferência e seque suavemente." },
                  { step: "02", title: "Aplicação", desc: "Aplique de 3 a 5 gotas do Envy Skin na palma da mão ou diretamente no rosto." },
                  { step: "03", title: "Massagem", desc: "Espalhe com movimentos ascendentes (de baixo para cima) até a completa absorção." },
                  { step: "04", title: "Proteção", desc: "Pela manhã, finalize sempre com protetor solar para proteger sua nova pele." },
                ].map((item, i) => (
                  <div key={i} className="flex gap-4 sm:gap-6">
                    <span className="text-3xl sm:text-4xl font-black text-[#F5F3FF] tabular-nums">{item.step}</span>
                    <div className="space-y-1">
                      <h4 className="font-bold text-[#4C1D95] text-sm sm:text-base">{item.title}</h4>
                      <p className="text-xs sm:text-sm text-[#9B89B3] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative px-4 sm:px-0">
              <img 
                src="https://i.ibb.co/wZspKs5V/image.png" 
                alt="How to use Envy Skin" 
                className="rounded-2xl sm:rounded-3xl shadow-2xl"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-2xl sm:rounded-3xl"></div>
            </div>
          </div>
        </section>

        <Kits onAddToCart={handleAddToCart} />

        <section className="py-20 bg-[#F5F3FF]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-8">
            <div className="w-20 h-20 bg-[#7B61FF] text-white rounded-full flex items-center justify-center mx-auto mb-8">
              <ShieldCheck size={40} />
            </div>
            <h2 className="text-3xl font-bold text-[#4C1D95]">Garantia Blindada de 30 Dias</h2>
            <p className="text-[#9B89B3] max-w-2xl mx-auto leading-relaxed">
              Temos tanta confiança na eficácia do Envy Skin que oferecemos uma garantia incondicional. 
              Se em 30 dias você não notar uma melhora visível na sua pele, nós devolvemos 100% do seu dinheiro. 
              Sem perguntas, sem burocracia.
            </p>
          </div>
        </section>

        <section className="py-20 bg-[#4C1D95] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 text-center space-y-12">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">O que dizem nossas clientes</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { name: "Mariana S.", text: "Minhas rugas em volta dos olhos sumiram em 2 semanas. É impressionante!", location: "São Paulo, SP" },
                { name: "Carla M.", text: "O melhor sérum que já usei. Minha pele está muito mais firme e iluminada.", location: "Rio de Janeiro, RJ" },
                { name: "Patrícia L.", text: "Tinha muitas manchas de sol e o Envy Skin clareou quase tudo. Recomendo!", location: "Curitiba, PR" },
              ].map((review, i) => (
                <div key={i} className="bg-white/5 p-8 rounded-2xl border border-white/10 text-left space-y-4">
                  <div className="flex text-[#7B61FF]">
                    {[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" stroke="none" />)}
                  </div>
                  <p className="text-[#F5F3FF] italic leading-relaxed">"{review.text}"</p>
                  <div>
                    <p className="font-bold text-white">{review.name}</p>
                    <p className="text-xs text-[#9B89B3]">{review.location}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        
        <FAQ />
      </main>

      <Footer />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          display: flex;
          animation: marquee 30s linear infinite;
        }
      `}} />
    </div>
  );
}
