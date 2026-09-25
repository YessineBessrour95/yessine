'use strict';

// Référentiel du baromètre social / QVT : 8 dimensions x 5 questions = 40 questions.
// Échelle de Likert : 1 = Pas du tout d'accord ... 5 = Tout à fait d'accord, 0 = Ne se prononce pas.
// `reverse: true` : question formulée négativement, le score est inversé (6 - valeur).

const SCALE = [
  { value: 1, label: "Pas du tout d'accord" },
  { value: 2, label: "Plutôt pas d'accord" },
  { value: 3, label: 'Ni d’accord ni pas d’accord' },
  { value: 4, label: "Plutôt d'accord" },
  { value: 5, label: "Tout à fait d'accord" },
  { value: 0, label: 'Ne se prononce pas' },
];

const DIMENSIONS = [
  {
    id: 'sens',
    label: 'Sens et contenu du travail',
    questions: [
      { text: 'Mon travail a du sens pour moi.' },
      { text: 'Je sais clairement ce que l’on attend de moi dans mon poste.' },
      { text: 'Mes compétences sont bien utilisées dans mon travail.' },
      { text: 'Je dispose d’une autonomie suffisante pour organiser mon travail.' },
      { text: 'Je suis fier(ère) de travailler dans cette organisation.' },
    ],
  },
  {
    id: 'charge',
    label: 'Charge et organisation du travail',
    questions: [
      { text: 'Ma charge de travail est raisonnable.' },
      { text: 'Je dispose des moyens matériels et des outils nécessaires pour bien faire mon travail.' },
      { text: 'Les priorités de mon travail sont clairement définies.' },
      { text: 'Je suis souvent interrompu(e) au point de ne pas pouvoir mener mon travail à bien.', reverse: true },
      { text: 'Les délais qui me sont fixés sont réalistes.' },
    ],
  },
  {
    id: 'management',
    label: 'Management de proximité',
    questions: [
      { text: 'Mon responsable est disponible quand j’ai besoin de lui/d’elle.' },
      { text: 'Mon responsable me donne des retours réguliers et constructifs sur mon travail.' },
      { text: 'Mon responsable me traite avec respect et équité.' },
      { text: 'Mon responsable me fait confiance.' },
      { text: 'Mon responsable prend en compte mes suggestions.' },
    ],
  },
  {
    id: 'equipe',
    label: 'Relations et climat d’équipe',
    questions: [
      { text: 'L’ambiance au sein de mon équipe est bonne.' },
      { text: 'Je peux compter sur mes collègues en cas de difficulté.' },
      { text: 'La coopération entre les services est efficace.' },
      { text: 'Je me sens intégré(e) dans mon équipe.' },
      { text: 'Il m’arrive d’être témoin ou victime de comportements irrespectueux au travail.', reverse: true },
    ],
  },
  {
    id: 'reconnaissance',
    label: 'Reconnaissance et rémunération',
    questions: [
      { text: 'Mon travail est reconnu à sa juste valeur.' },
      { text: 'Ma rémunération est en adéquation avec mes responsabilités.' },
      { text: 'Les critères d’augmentation et de promotion sont clairs et justes.' },
      { text: 'Mes efforts sont valorisés par ma hiérarchie.' },
      { text: 'Les avantages sociaux proposés répondent à mes besoins.' },
    ],
  },
  {
    id: 'developpement',
    label: 'Développement et carrière',
    questions: [
      { text: 'J’ai accès aux formations dont j’ai besoin.' },
      { text: 'J’ai des perspectives d’évolution professionnelle dans l’organisation.' },
      { text: 'Mon entretien annuel est utile pour mon développement.' },
      { text: 'J’ai l’occasion d’apprendre et de progresser dans mon travail.' },
      { text: 'La mobilité interne est encouragée.' },
    ],
  },
  {
    id: 'equilibre',
    label: 'Équilibre de vie et santé',
    questions: [
      { text: 'Je parviens à concilier ma vie professionnelle et ma vie personnelle.' },
      { text: 'Mes horaires de travail sont compatibles avec mes contraintes personnelles.' },
      { text: 'Je ressens régulièrement un stress excessif lié à mon travail.', reverse: true },
      { text: 'Mes conditions de travail (locaux, sécurité, ergonomie) sont satisfaisantes.' },
      { text: 'Mon droit à la déconnexion est respecté.' },
    ],
  },
  {
    id: 'direction',
    label: 'Communication et confiance envers la direction',
    questions: [
      { text: 'Je suis bien informé(e) de la stratégie et des orientations de l’organisation.' },
      { text: 'J’ai confiance dans les décisions prises par la direction.' },
      { text: 'La communication interne est claire et transparente.' },
      { text: 'Les résultats des précédents baromètres ont donné lieu à des actions concrètes.' },
      { text: 'Je recommanderais mon organisation comme employeur à un proche.' },
    ],
  },
];

// Questions à plat, numérotées q1..q40.
const QUESTIONS = [];
for (const dim of DIMENSIONS) {
  for (const q of dim.questions) {
    QUESTIONS.push({
      id: `q${QUESTIONS.length + 1}`,
      dimension: dim.id,
      text: q.text,
      reverse: Boolean(q.reverse),
    });
  }
}

// Questions de profil (facultatives, utilisées pour les filtres du tableau de bord).
const DEMOGRAPHICS = [
  {
    id: 'service',
    label: 'Votre service / direction',
    options: ['Direction générale', 'Ressources humaines', 'Finance', 'Commercial', 'Production', 'Informatique', 'Logistique', 'Autre'],
  },
  {
    id: 'seniority',
    label: 'Votre ancienneté',
    options: ['Moins d’1 an', '1 à 3 ans', '3 à 10 ans', 'Plus de 10 ans'],
  },
  {
    id: 'status',
    label: 'Votre statut',
    options: ['Cadre', 'Agent de maîtrise / technicien', 'Employé / ouvrier'],
  },
];

// En dessous de ce nombre de répondants, un sous-groupe n'est pas affiché (anonymat).
const ANONYMITY_THRESHOLD = 5;

module.exports = { SCALE, DIMENSIONS, QUESTIONS, DEMOGRAPHICS, ANONYMITY_THRESHOLD };
