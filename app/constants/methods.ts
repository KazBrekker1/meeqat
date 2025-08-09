export interface MethodOption {
  label: string;
  value: number;
}

export const METHOD_OPTIONS: MethodOption[] = [
  { value: 0, label: "Jafari / Shia Ithna-Ashari" },
  { value: 1, label: "University of Islamic Sciences, Karachi" },
  { value: 2, label: "Islamic Society of North America" },
  { value: 3, label: "Muslim World League" },
  { value: 4, label: "Umm Al-Qura University, Makkah" },
  { value: 5, label: "Egyptian General Authority of Survey" },
  { value: 6, label: "Institute of Geophysics, University of Tehran" },
  { value: 7, label: "Gulf Region" },
  { value: 8, label: "Kuwait" },
  { value: 9, label: "Qatar" },
  { value: 10, label: "Majlis Ugama Islam Singapura, Singapore" },
  { value: 11, label: "Union Organization islamic de France" },
  { value: 12, label: "Diyanet İşleri Başkanlığı, Turkey" },
  { value: 13, label: "Spiritual Administration of Muslims of Russia" },
  { value: 14, label: "Moonsighting Committee Worldwide (requires shafaq)" },
  { value: 15, label: "Dubai (experimental)" },
  { value: 16, label: "Jabatan Kemajuan Islam Malaysia (JAKIM)" },
  { value: 17, label: "Tunisia" },
  { value: 18, label: "Algeria" },
  { value: 19, label: "KEMENAG Indonesia" },
  { value: 20, label: "Morocco" },
  { value: 21, label: "Comunidade Islamica de Lisboa" },
  {
    value: 22,
    label: "Ministry of Awqaf, Islamic Affairs and Holy Places, Jordan",
  },
  { value: 23, label: "Qatar (Deprecated duplicate)" },
  { value: 99, label: "Custom" },
];
