"use strict";
const { COUNTRIES } = require("./core.cjs");
const eu = COUNTRIES.Europe.filter(
  (c) =>
    ![
      "Iceland",
      "Liechtenstein",
      "Norway",
      "Switzerland",
      "United Kingdom",
    ].includes(c),
);
const COUNTRY_GROUPS = [
  {
    id: "europe",
    label: "Europe · EU/EEA, UK & Switzerland",
    countries: COUNTRIES.Europe,
  },
  { id: "eu", label: "European Union", countries: eu },
  {
    id: "eea",
    label: "European Economic Area",
    countries: COUNTRIES.Europe.filter(
      (c) => !["Switzerland", "United Kingdom"].includes(c),
    ),
  },
  { id: "gulf", label: "Gulf · GCC countries", countries: COUNTRIES.Gulf },
  { id: "australia", label: "Australia", countries: COUNTRIES.Australia },
  {
    id: "uk-ireland",
    label: "UK & Ireland",
    countries: ["United Kingdom", "Ireland"],
  },
  {
    id: "nordics",
    label: "Nordic countries",
    countries: ["Denmark", "Finland", "Iceland", "Norway", "Sweden"],
  },
  {
    id: "dach",
    label: "Germany, Austria & Switzerland",
    countries: ["Germany", "Austria", "Switzerland"],
  },
  {
    id: "benelux",
    label: "Benelux",
    countries: ["Belgium", "Netherlands", "Luxembourg"],
  },
  {
    id: "baltics",
    label: "Baltic countries",
    countries: ["Estonia", "Latvia", "Lithuania"],
  },
  {
    id: "southern",
    label: "Southern Europe",
    countries: ["Portugal", "Spain", "Italy", "Greece", "Malta", "Cyprus"],
  },
  {
    id: "central-east",
    label: "Central & Eastern Europe",
    countries: [
      "Poland",
      "Czechia",
      "Slovakia",
      "Hungary",
      "Slovenia",
      "Croatia",
      "Romania",
      "Bulgaria",
    ],
  },
];
module.exports = { COUNTRY_GROUPS };
