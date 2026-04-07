import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "tr";

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Sidebar
    "nav.dashboard": "Dashboard",
    "nav.architecture": "Architecture",
    "nav.processes": "Processes",
    "nav.sequences": "Sequences",
    "nav.dependencies": "Dependencies",
    "nav.er_diagram": "ER Diagram",
    "nav.api_map": "API Map",
    "nav.tech_radar": "Tech Radar",
    "nav.onboarding": "Onboarding",
    "nav.code_quality": "Code Quality",
    "nav.tech_debt": "Tech Debt",
    "nav.event_flow": "Events",
    "nav.structure": "Structure",
    "nav.api_stack": "API & Stack",
    "nav.health_check": "Health Check",
    "nav.modules": "Modules",
    "nav.import": "Add Project",
    "nav.settings": "Settings",
    "nav.hotspots": "Hotspots",
    "nav.diff": "Architecture Diff",
    "nav.rules": "Custom Rules",
    "nav.group.analysis": "Analysis",
    "nav.group.diagrams": "Diagrams",
    "nav.group.quality": "Quality",

    // Dashboard
    "dashboard.title": "Architecture analysis",
    "dashboard.files": "Files",
    "dashboard.symbols": "Symbols",
    "dashboard.relations": "Relations",
    "dashboard.lines": "Lines of Code",
    "dashboard.modules": "Modules",
    "dashboard.endpoints": "API Endpoints",
    "dashboard.entities": "DB Entities",
    "dashboard.tech_stack": "Tech Stack",
    "dashboard.languages": "Languages",
    "dashboard.arch_layers": "Architecture Layers",

    // Architecture
    "arch.health": "Architecture Health",
    "arch.insights": "Insights",
    "arch.files": "Files",
    "arch.key_findings": "Key Findings",
    "arch.module_ranking": "Module Risk Ranking",
    "arch.impact_mode": "Impact Mode",
    "arch.select_module": "Select a module",
    "arch.click_inspect": "Click to inspect",
    "arch.double_click": "Double-click to drill down",
    "arch.feature_tracing": "Feature Tracing",
    "arch.dep_matrix": "Dependency Matrix",
    "arch.top_risks": "Top Risks",
    "arch.coupling": "Coupling",
    "arch.security": "Security",
    "arch.dead_code": "Dead Code",
    "arch.violations": "Violations",
    "arch.tech_debt": "Tech Debt",
    "arch.healthy": "Healthy",
    "arch.moderate": "Moderate",
    "arch.at_risk": "At Risk",

    // Processes
    "proc.title": "How The System Works",
    "proc.subtitle": "processes · {steps} steps — click to explore algorithms and data flow",
    "proc.system_map": "System Architecture Map",
    "proc.input": "Input",
    "proc.output": "Output",
    "proc.algorithm": "Algorithm",
    "proc.steps": "steps",

    // Quality
    "quality.title": "Code Quality & Architecture Patterns",
    "quality.code_quality": "Code Quality",
    "quality.coupling_analysis": "Coupling Analysis",
    "quality.consistency": "Consistency",
    "quality.arch_patterns": "Architecture Patterns",
    "quality.module_quality": "Module Quality",
    "quality.critical": "Critical",
    "quality.major": "Major",
    "quality.minor": "Minor",
    "quality.info": "Info",
    "quality.suggestion": "Suggestion",
    "quality.evidence": "Evidence",
    "quality.violations": "Violations",
    "quality.recommendations": "Recommendations",
    "quality.view_in_arch": "View in Architecture",

    // Tech Debt
    "debt.title": "Technical Debt Ledger",
    "debt.subtitle": "Estimated cost at ${rate}/hour developer rate",
    "debt.total_fix": "Total Fix Cost",
    "debt.annual": "Annual Maintenance",
    "debt.quick_wins": "Quick Wins (Do This Week)",
    "debt.all_categories": "All Debt Categories",
    "debt.fix_cost": "fix cost",
    "debt.annual_cost": "annual cost",
    "debt.best_roi": "Best ROI",
    "debt.hours": "hours of work",
    "debt.ongoing": "ongoing cost per year",
    "debt.saves": "Saves",

    // Event Flow
    "event.title": "Event Flow & Bounded Contexts",
    "event.comm_patterns": "Communication Patterns",
    "event.bounded_contexts": "Bounded Contexts (DDD)",
    "event.event_flows": "Event Flows",
    "event.clean": "Clean",
    "event.coupled": "Coupled",
    "event.publisher": "Publisher",
    "event.subscriber": "Subscriber",

    // Health
    "health.title": "Architecture Health",
    "health.subtitle": "Drift detection, layer violations, circular dependencies, and module health",
    "health.layer_rules": "Layer Dependency Rules",
    "health.circular_deps": "Circular Dependencies",
    "health.module_health": "Module Health",
    "health.no_violations": "No layer violations detected. Architecture boundaries are clean.",
    "health.no_circular": "No circular dependencies between modules.",
    "health.score": "Score",

    // Modules
    "modules.title": "Modules",
    "modules.subtitle": "modules detected across the codebase",
    "modules.files": "files",
    "modules.symbols": "symbols",
    "modules.lines": "lines",
    "modules.of_codebase": "of codebase",

    // Sequence
    "seq.title": "Sequence Diagrams",
    "seq.subtitle": "Select an API endpoint to trace its execution flow — who calls whom, in what order, across modules.",
    "seq.search": "Search endpoints... (e.g. /api/sales, GET)",
    "seq.select": "Select an API endpoint to generate a sequence diagram",
    "seq.available": "endpoints available",

    // Onboarding
    "onboard.welcome": "Welcome to",
    "onboard.subtitle": "Onboarding guide — everything you need to understand this project",
    "onboard.structure": "How is it structured?",
    "onboard.structure_desc": "The codebase follows a layered architecture. Each layer has a specific responsibility. Higher layers (UI) depend on lower layers (data), never the reverse.",
    "onboard.connections": "How do modules connect?",
    "onboard.what_does": "What does it DO?",
    "onboard.db_schema": "Database Schema",
    "onboard.tech_stack": "Tech Stack",

    // Settings
    "settings.title": "Settings",
    "settings.subtitle": "Customize your ArchLens experience",
    "settings.theme": "Theme",
    "settings.language": "Language",
    "settings.about": "About ArchLens",

    // Common
    "common.search": "Search...",
    "common.loading": "Loading...",
    "common.no_data": "No data available",
    "common.export": "Export",
    "common.close": "Close",
  },

  tr: {
    // Sidebar
    "nav.dashboard": "Gösterge Paneli",
    "nav.architecture": "Mimari",
    "nav.processes": "Süreçler",
    "nav.sequences": "Sıralı Diyagramlar",
    "nav.dependencies": "Bağımlılıklar",
    "nav.er_diagram": "ER Diyagramı",
    "nav.api_map": "API Haritası",
    "nav.tech_radar": "Teknoloji Radarı",
    "nav.onboarding": "Başlangıç Rehberi",
    "nav.code_quality": "Kod Kalitesi",
    "nav.tech_debt": "Teknik Borç",
    "nav.event_flow": "Olaylar",
    "nav.structure": "Yapı",
    "nav.api_stack": "API & Teknoloji",
    "nav.health_check": "Sağlık Kontrolü",
    "nav.modules": "Modüller",
    "nav.import": "Proje Ekle",
    "nav.settings": "Ayarlar",
    "nav.hotspots": "Sıcak Noktalar",
    "nav.diff": "Mimari Karşılaştırma",
    "nav.rules": "Özel Kurallar",
    "nav.group.analysis": "Analiz",
    "nav.group.diagrams": "Diyagramlar",
    "nav.group.quality": "Kalite",

    // Dashboard
    "dashboard.title": "Mimari analizi",
    "dashboard.files": "Dosyalar",
    "dashboard.symbols": "Semboller",
    "dashboard.relations": "İlişkiler",
    "dashboard.lines": "Kod Satırı",
    "dashboard.modules": "Modüller",
    "dashboard.endpoints": "API Uç Noktaları",
    "dashboard.entities": "Veritabanı Varlıkları",
    "dashboard.tech_stack": "Teknoloji Yığını",
    "dashboard.languages": "Programlama Dilleri",
    "dashboard.arch_layers": "Mimari Katmanlar",

    // Architecture
    "arch.health": "Mimari Sağlığı",
    "arch.insights": "İçgörüler",
    "arch.files": "Dosyalar",
    "arch.key_findings": "Önemli Bulgular",
    "arch.module_ranking": "Modül Risk Sıralaması",
    "arch.impact_mode": "Etki Modu",
    "arch.select_module": "Bir modül seçin",
    "arch.click_inspect": "İncelemek için tıklayın",
    "arch.double_click": "Detaya inmek için çift tıklayın",
    "arch.feature_tracing": "Özellik İzleme",
    "arch.dep_matrix": "Bağımlılık Matrisi",
    "arch.top_risks": "En Büyük Riskler",
    "arch.coupling": "Bağlaşım",
    "arch.security": "Güvenlik",
    "arch.dead_code": "Ölü Kod",
    "arch.violations": "İhlaller",
    "arch.tech_debt": "Teknik Borç",
    "arch.healthy": "Sağlıklı",
    "arch.moderate": "Orta",
    "arch.at_risk": "Riskli",

    // Processes
    "proc.title": "Sistem Nasıl Çalışır",
    "proc.subtitle": "süreç · {steps} adım — algoritmaları ve veri akışını keşfetmek için tıklayın",
    "proc.system_map": "Sistem Mimari Haritası",
    "proc.input": "Girdi",
    "proc.output": "Çıktı",
    "proc.algorithm": "Algoritma",
    "proc.steps": "adım",

    // Quality
    "quality.title": "Kod Kalitesi & Mimari Kalıplar",
    "quality.code_quality": "Kod Kalitesi",
    "quality.coupling_analysis": "Bağlaşım Analizi",
    "quality.consistency": "Tutarlılık",
    "quality.arch_patterns": "Mimari Kalıplar",
    "quality.module_quality": "Modül Kalitesi",
    "quality.critical": "Kritik",
    "quality.major": "Önemli",
    "quality.minor": "Küçük",
    "quality.info": "Bilgi",
    "quality.suggestion": "Öneri",
    "quality.evidence": "Kanıt",
    "quality.violations": "İhlaller",
    "quality.recommendations": "Öneriler",
    "quality.view_in_arch": "Mimaride Görüntüle",

    // Tech Debt
    "debt.title": "Teknik Borç Defteri",
    "debt.subtitle": "Tahmini maliyet — saat başı ${rate} geliştirici ücreti",
    "debt.total_fix": "Toplam Düzeltme Maliyeti",
    "debt.annual": "Yıllık Bakım Maliyeti",
    "debt.quick_wins": "Hızlı Kazanımlar (Bu Hafta Yapın)",
    "debt.all_categories": "Tüm Borç Kategorileri",
    "debt.fix_cost": "düzeltme maliyeti",
    "debt.annual_cost": "yıllık maliyet",
    "debt.best_roi": "En İyi Yatırım Getirisi",
    "debt.hours": "saatlik iş",
    "debt.ongoing": "yıllık devam eden maliyet",
    "debt.saves": "Tasarruf",

    // Event Flow
    "event.title": "Olay Akışı & Sınırlı Bağlamlar",
    "event.comm_patterns": "İletişim Kalıpları",
    "event.bounded_contexts": "Sınırlı Bağlamlar (DDD)",
    "event.event_flows": "Olay Akışları",
    "event.clean": "Temiz",
    "event.coupled": "Bağlaşık",
    "event.publisher": "Yayıncı",
    "event.subscriber": "Abone",

    // Health
    "health.title": "Mimari Sağlığı",
    "health.subtitle": "Sapma tespiti, katman ihlalleri, döngüsel bağımlılıklar ve modül sağlığı",
    "health.layer_rules": "Katman Bağımlılık Kuralları",
    "health.circular_deps": "Döngüsel Bağımlılıklar",
    "health.module_health": "Modül Sağlığı",
    "health.no_violations": "Katman ihlali tespit edilmedi. Mimari sınırlar temiz.",
    "health.no_circular": "Modüller arası döngüsel bağımlılık yok.",
    "health.score": "Puan",

    // Modules
    "modules.title": "Modüller",
    "modules.subtitle": "kod tabanında tespit edilen modüller",
    "modules.files": "dosya",
    "modules.symbols": "sembol",
    "modules.lines": "satır",
    "modules.of_codebase": "kod tabanı",

    // Sequence
    "seq.title": "Sıralı Diyagramlar",
    "seq.subtitle": "Yürütme akışını izlemek için bir API uç noktası seçin — kim kimi, hangi sırayla, hangi modüller üzerinden çağırıyor.",
    "seq.search": "Uç noktaları arayın... (ör. /api/sales, GET)",
    "seq.select": "Sıralı diyagram oluşturmak için bir API uç noktası seçin",
    "seq.available": "uç nokta mevcut",

    // Onboarding
    "onboard.welcome": "Hoş Geldiniz —",
    "onboard.subtitle": "Başlangıç rehberi — bu projeyi anlamak için ihtiyacınız olan her şey",
    "onboard.structure": "Nasıl yapılandırılmış?",
    "onboard.structure_desc": "Kod tabanı katmanlı bir mimariyi takip eder. Her katmanın belirli bir sorumluluğu vardır. Üst katmanlar (UI) alt katmanlara (veri) bağımlıdır, tersi asla.",
    "onboard.connections": "Modüller nasıl bağlanıyor?",
    "onboard.what_does": "Ne yapıyor?",
    "onboard.db_schema": "Veritabanı Şeması",
    "onboard.tech_stack": "Teknoloji Yığını",

    // Settings
    "settings.title": "Ayarlar",
    "settings.subtitle": "ArchLens deneyiminizi özelleştirin",
    "settings.theme": "Tema",
    "settings.language": "Dil",
    "settings.about": "ArchLens Hakkında",

    // Common
    "common.search": "Ara...",
    "common.loading": "Yükleniyor...",
    "common.no_data": "Veri mevcut değil",
    "common.export": "Dışa Aktar",
    "common.close": "Kapat",
  },
};

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      locale: "en",
      setLocale: (locale: Locale) => set({ locale }),
      t: (key: string, params?: Record<string, string | number>) => {
        const { locale } = get();
        let text = translations[locale]?.[key] || translations.en[key] || key;
        if (params) {
          for (const [k, v] of Object.entries(params)) {
            text = text.replace(`{${k}}`, String(v));
          }
        }
        return text;
      },
    }),
    { name: "archlens-locale" },
  ),
);
