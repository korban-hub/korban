"use client";

import { useMemo, useState } from "react";

type SortOption =
  | "Most Recent"
  | "Follow-Ups"
  | "Alphabetical"
  | "Most Equipment"
  | "Largest Bid"
  | "Lowest Bid"
  | "Bid Due Date";

type ProjectStatus =
  | "Draft"
  | "Internal Review"
  | "Ready To Send"
  | "Submitted"
  | "Won"
  | "Lost"
  | "Still Chasing"
  | "No Response";

const sortOptions: SortOption[] = [
  "Most Recent",
  "Follow-Ups",
  "Alphabetical",
  "Most Equipment",
  "Largest Bid",
  "Lowest Bid",
  "Bid Due Date",
];

const projects = [
  {
    id: "project-01",
    name: "Mare Island Apartments 01",
    customer: "Turner",
    location: "Vallejo, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/01/26",
    lastUpdated: "06/02/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Union",
    status: "Ready To Send" as ProjectStatus,
    linearFeet: 520,
    frames: 208,
    planks: 260,
    equipmentScore: 468,
    finalBid: 68500,
    href: "/estimate-review",
  },
  {
    id: "project-02",
    name: "Oakland Mixed Use 02",
    customer: "Webcor",
    location: "Oakland, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/04/26",
    lastUpdated: "06/05/26",
    bidPhase: "50% CD",
    unionStatus: "Non-Union",
    status: "No Response" as ProjectStatus,
    linearFeet: 593,
    frames: 237,
    planks: 296,
    equipmentScore: 533,
    finalBid: 82250,
    href: "/estimate-review",
  },
  {
    id: "project-03",
    name: "San Jose Civic 03",
    customer: "McCarthy",
    location: "San Jose, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/07/26",
    lastUpdated: "06/08/26",
    bidPhase: "75% CD",
    unionStatus: "Non-Union",
    status: "Still Chasing" as ProjectStatus,
    linearFeet: 666,
    frames: 266,
    planks: 332,
    equipmentScore: 598,
    finalBid: 96000,
    href: "/estimate-review",
  },
  {
    id: "project-04",
    name: "Berkeley Housing 04",
    customer: "XL",
    location: "Berkeley, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/10/26",
    lastUpdated: "06/11/26",
    bidPhase: "100% CD",
    unionStatus: "Union",
    status: "Won" as ProjectStatus,
    linearFeet: 739,
    frames: 296,
    planks: 370,
    equipmentScore: 666,
    finalBid: 109750,
    href: "/estimate-review",
  },
  {
    id: "project-05",
    name: "Vacaville Senior 05",
    customer: "Devcon",
    location: "Vacaville, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/13/26",
    lastUpdated: "06/14/26",
    bidPhase: "GMP",
    unionStatus: "Non-Union",
    status: "Lost" as ProjectStatus,
    linearFeet: 812,
    frames: 325,
    planks: 406,
    equipmentScore: 731,
    finalBid: 123500,
    href: "/estimate-review",
  },
  {
    id: "project-06",
    name: "Napa Retail 06",
    customer: "Swinerton",
    location: "Napa, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/16/26",
    lastUpdated: "06/17/26",
    bidPhase: "Final Round",
    unionStatus: "Non-Union",
    status: "Draft" as ProjectStatus,
    linearFeet: 885,
    frames: 354,
    planks: 442,
    equipmentScore: 796,
    finalBid: 137250,
    href: "/estimate-review",
  },
  {
    id: "project-07",
    name: "Sacramento Medical 07",
    customer: "DPR",
    location: "Sacramento, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/19/26",
    lastUpdated: "06/20/26",
    bidPhase: "Awarded",
    unionStatus: "Union",
    status: "Submitted" as ProjectStatus,
    linearFeet: 958,
    frames: 383,
    planks: 479,
    equipmentScore: 862,
    finalBid: 151000,
    href: "/estimate-review",
  },
  {
    id: "project-08",
    name: "Fremont Tech 08",
    customer: "Clark",
    location: "Fremont, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/22/26",
    lastUpdated: "06/23/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Non-Union",
    status: "Internal Review" as ProjectStatus,
    linearFeet: 1031,
    frames: 412,
    planks: 515,
    equipmentScore: 927,
    finalBid: 164750,
    href: "/estimate-review",
  },
  {
    id: "project-09",
    name: "Petaluma Mixed Use 09",
    customer: "Nibbi",
    location: "Petaluma, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/25/26",
    lastUpdated: "06/26/26",
    bidPhase: "50% CD",
    unionStatus: "Non-Union",
    status: "Ready To Send" as ProjectStatus,
    linearFeet: 1104,
    frames: 442,
    planks: 552,
    equipmentScore: 994,
    finalBid: 178500,
    href: "/estimate-review",
  },
  {
    id: "project-10",
    name: "Richmond School 10",
    customer: "Flint",
    location: "Richmond, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/28/26",
    lastUpdated: "06/28/26",
    bidPhase: "75% CD",
    unionStatus: "Union",
    status: "No Response" as ProjectStatus,
    linearFeet: 1177,
    frames: 471,
    planks: 589,
    equipmentScore: 1060,
    finalBid: 192250,
    href: "/estimate-review",
  },
  {
    id: "project-11",
    name: "Walnut Creek MOB 11",
    customer: "Level 10",
    location: "Walnut Creek, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/03/26",
    lastUpdated: "06/04/26",
    bidPhase: "100% CD",
    unionStatus: "Non-Union",
    status: "Still Chasing" as ProjectStatus,
    linearFeet: 1250,
    frames: 500,
    planks: 625,
    equipmentScore: 1125,
    finalBid: 206000,
    href: "/estimate-review",
  },
  {
    id: "project-12",
    name: "Fairfield Hotel 12",
    customer: "Balfour",
    location: "Fairfield, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/06/26",
    lastUpdated: "06/07/26",
    bidPhase: "GMP",
    unionStatus: "Non-Union",
    status: "Won" as ProjectStatus,
    linearFeet: 1323,
    frames: 529,
    planks: 661,
    equipmentScore: 1190,
    finalBid: 219750,
    href: "/estimate-review",
  },
  {
    id: "project-13",
    name: "Mare Island Apartments 13",
    customer: "Turner",
    location: "Vallejo, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/09/26",
    lastUpdated: "06/10/26",
    bidPhase: "Final Round",
    unionStatus: "Union",
    status: "Lost" as ProjectStatus,
    linearFeet: 1396,
    frames: 558,
    planks: 698,
    equipmentScore: 1256,
    finalBid: 233500,
    href: "/estimate-review",
  },
  {
    id: "project-14",
    name: "Oakland Mixed Use 14",
    customer: "Webcor",
    location: "Oakland, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/12/26",
    lastUpdated: "06/13/26",
    bidPhase: "Awarded",
    unionStatus: "Non-Union",
    status: "Draft" as ProjectStatus,
    linearFeet: 1469,
    frames: 588,
    planks: 735,
    equipmentScore: 1323,
    finalBid: 247250,
    href: "/estimate-review",
  },
  {
    id: "project-15",
    name: "San Jose Civic 15",
    customer: "McCarthy",
    location: "San Jose, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/15/26",
    lastUpdated: "06/16/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Non-Union",
    status: "Submitted" as ProjectStatus,
    linearFeet: 1542,
    frames: 617,
    planks: 771,
    equipmentScore: 1388,
    finalBid: 261000,
    href: "/estimate-review",
  },
  {
    id: "project-16",
    name: "Berkeley Housing 16",
    customer: "XL",
    location: "Berkeley, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/18/26",
    lastUpdated: "06/19/26",
    bidPhase: "50% CD",
    unionStatus: "Union",
    status: "Internal Review" as ProjectStatus,
    linearFeet: 1615,
    frames: 646,
    planks: 808,
    equipmentScore: 1454,
    finalBid: 274750,
    href: "/estimate-review",
  },
  {
    id: "project-17",
    name: "Vacaville Senior 17",
    customer: "Devcon",
    location: "Vacaville, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/21/26",
    lastUpdated: "06/22/26",
    bidPhase: "75% CD",
    unionStatus: "Non-Union",
    status: "Ready To Send" as ProjectStatus,
    linearFeet: 1688,
    frames: 675,
    planks: 844,
    equipmentScore: 1519,
    finalBid: 288500,
    href: "/estimate-review",
  },
  {
    id: "project-18",
    name: "Napa Retail 18",
    customer: "Swinerton",
    location: "Napa, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/24/26",
    lastUpdated: "06/25/26",
    bidPhase: "100% CD",
    unionStatus: "Non-Union",
    status: "No Response" as ProjectStatus,
    linearFeet: 1761,
    frames: 704,
    planks: 880,
    equipmentScore: 1584,
    finalBid: 302250,
    href: "/estimate-review",
  },
  {
    id: "project-19",
    name: "Sacramento Medical 19",
    customer: "DPR",
    location: "Sacramento, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/27/26",
    lastUpdated: "06/28/26",
    bidPhase: "GMP",
    unionStatus: "Union",
    status: "Still Chasing" as ProjectStatus,
    linearFeet: 1834,
    frames: 734,
    planks: 918,
    equipmentScore: 1652,
    finalBid: 316000,
    href: "/estimate-review",
  },
  {
    id: "project-20",
    name: "Fremont Tech 20",
    customer: "Clark",
    location: "Fremont, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/02/26",
    lastUpdated: "06/03/26",
    bidPhase: "Final Round",
    unionStatus: "Non-Union",
    status: "Won" as ProjectStatus,
    linearFeet: 1907,
    frames: 763,
    planks: 954,
    equipmentScore: 1717,
    finalBid: 329750,
    href: "/estimate-review",
  },
  {
    id: "project-21",
    name: "Petaluma Mixed Use 21",
    customer: "Nibbi",
    location: "Petaluma, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/05/26",
    lastUpdated: "06/06/26",
    bidPhase: "Awarded",
    unionStatus: "Non-Union",
    status: "Lost" as ProjectStatus,
    linearFeet: 1980,
    frames: 792,
    planks: 990,
    equipmentScore: 1782,
    finalBid: 343500,
    href: "/estimate-review",
  },
  {
    id: "project-22",
    name: "Richmond School 22",
    customer: "Flint",
    location: "Richmond, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/08/26",
    lastUpdated: "06/09/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Union",
    status: "Draft" as ProjectStatus,
    linearFeet: 2053,
    frames: 821,
    planks: 1026,
    equipmentScore: 1847,
    finalBid: 357250,
    href: "/estimate-review",
  },
  {
    id: "project-23",
    name: "Walnut Creek MOB 23",
    customer: "Level 10",
    location: "Walnut Creek, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/11/26",
    lastUpdated: "06/12/26",
    bidPhase: "50% CD",
    unionStatus: "Non-Union",
    status: "Submitted" as ProjectStatus,
    linearFeet: 2126,
    frames: 850,
    planks: 1062,
    equipmentScore: 1912,
    finalBid: 371000,
    href: "/estimate-review",
  },
  {
    id: "project-24",
    name: "Fairfield Hotel 24",
    customer: "Balfour",
    location: "Fairfield, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/14/26",
    lastUpdated: "06/15/26",
    bidPhase: "75% CD",
    unionStatus: "Non-Union",
    status: "Internal Review" as ProjectStatus,
    linearFeet: 2199,
    frames: 880,
    planks: 1100,
    equipmentScore: 1980,
    finalBid: 384750,
    href: "/estimate-review",
  },
  {
    id: "project-25",
    name: "Mare Island Apartments 25",
    customer: "Turner",
    location: "Vallejo, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/17/26",
    lastUpdated: "06/18/26",
    bidPhase: "100% CD",
    unionStatus: "Union",
    status: "Ready To Send" as ProjectStatus,
    linearFeet: 2272,
    frames: 909,
    planks: 1136,
    equipmentScore: 2045,
    finalBid: 398500,
    href: "/estimate-review",
  },
  {
    id: "project-26",
    name: "Oakland Mixed Use 26",
    customer: "Webcor",
    location: "Oakland, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/20/26",
    lastUpdated: "06/21/26",
    bidPhase: "GMP",
    unionStatus: "Non-Union",
    status: "No Response" as ProjectStatus,
    linearFeet: 2345,
    frames: 938,
    planks: 1172,
    equipmentScore: 2110,
    finalBid: 412250,
    href: "/estimate-review",
  },
  {
    id: "project-27",
    name: "San Jose Civic 27",
    customer: "McCarthy",
    location: "San Jose, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/23/26",
    lastUpdated: "06/24/26",
    bidPhase: "Final Round",
    unionStatus: "Non-Union",
    status: "Still Chasing" as ProjectStatus,
    linearFeet: 2418,
    frames: 967,
    planks: 1209,
    equipmentScore: 2176,
    finalBid: 426000,
    href: "/estimate-review",
  },
  {
    id: "project-28",
    name: "Berkeley Housing 28",
    customer: "XL",
    location: "Berkeley, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/26/26",
    lastUpdated: "06/27/26",
    bidPhase: "Awarded",
    unionStatus: "Union",
    status: "Won" as ProjectStatus,
    linearFeet: 2491,
    frames: 996,
    planks: 1245,
    equipmentScore: 2241,
    finalBid: 439750,
    href: "/estimate-review",
  },
  {
    id: "project-29",
    name: "Vacaville Senior 29",
    customer: "Devcon",
    location: "Vacaville, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/01/26",
    lastUpdated: "06/02/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Non-Union",
    status: "Lost" as ProjectStatus,
    linearFeet: 2564,
    frames: 1026,
    planks: 1282,
    equipmentScore: 2308,
    finalBid: 68500,
    href: "/estimate-review",
  },
  {
    id: "project-30",
    name: "Napa Retail 30",
    customer: "Swinerton",
    location: "Napa, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/04/26",
    lastUpdated: "06/05/26",
    bidPhase: "50% CD",
    unionStatus: "Non-Union",
    status: "Draft" as ProjectStatus,
    linearFeet: 2637,
    frames: 1055,
    planks: 1319,
    equipmentScore: 2374,
    finalBid: 82250,
    href: "/estimate-review",
  },
  {
    id: "project-31",
    name: "Sacramento Medical 31",
    customer: "DPR",
    location: "Sacramento, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/07/26",
    lastUpdated: "06/08/26",
    bidPhase: "75% CD",
    unionStatus: "Union",
    status: "Submitted" as ProjectStatus,
    linearFeet: 2710,
    frames: 1084,
    planks: 1355,
    equipmentScore: 2439,
    finalBid: 96000,
    href: "/estimate-review",
  },
  {
    id: "project-32",
    name: "Fremont Tech 32",
    customer: "Clark",
    location: "Fremont, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/10/26",
    lastUpdated: "06/11/26",
    bidPhase: "100% CD",
    unionStatus: "Non-Union",
    status: "Internal Review" as ProjectStatus,
    linearFeet: 2783,
    frames: 1113,
    planks: 1391,
    equipmentScore: 2504,
    finalBid: 109750,
    href: "/estimate-review",
  },
  {
    id: "project-33",
    name: "Petaluma Mixed Use 33",
    customer: "Nibbi",
    location: "Petaluma, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/13/26",
    lastUpdated: "06/14/26",
    bidPhase: "GMP",
    unionStatus: "Non-Union",
    status: "Ready To Send" as ProjectStatus,
    linearFeet: 2856,
    frames: 1142,
    planks: 1428,
    equipmentScore: 2570,
    finalBid: 123500,
    href: "/estimate-review",
  },
  {
    id: "project-34",
    name: "Richmond School 34",
    customer: "Flint",
    location: "Richmond, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/16/26",
    lastUpdated: "06/17/26",
    bidPhase: "Final Round",
    unionStatus: "Union",
    status: "No Response" as ProjectStatus,
    linearFeet: 579,
    frames: 232,
    planks: 290,
    equipmentScore: 522,
    finalBid: 137250,
    href: "/estimate-review",
  },
  {
    id: "project-35",
    name: "Walnut Creek MOB 35",
    customer: "Level 10",
    location: "Walnut Creek, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/19/26",
    lastUpdated: "06/20/26",
    bidPhase: "Awarded",
    unionStatus: "Non-Union",
    status: "Still Chasing" as ProjectStatus,
    linearFeet: 652,
    frames: 261,
    planks: 326,
    equipmentScore: 587,
    finalBid: 151000,
    href: "/estimate-review",
  },
  {
    id: "project-36",
    name: "Fairfield Hotel 36",
    customer: "Balfour",
    location: "Fairfield, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/22/26",
    lastUpdated: "06/23/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Non-Union",
    status: "Won" as ProjectStatus,
    linearFeet: 725,
    frames: 290,
    planks: 362,
    equipmentScore: 652,
    finalBid: 164750,
    href: "/estimate-review",
  },
  {
    id: "project-37",
    name: "Mare Island Apartments 37",
    customer: "Turner",
    location: "Vallejo, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/25/26",
    lastUpdated: "06/26/26",
    bidPhase: "50% CD",
    unionStatus: "Union",
    status: "Lost" as ProjectStatus,
    linearFeet: 798,
    frames: 319,
    planks: 399,
    equipmentScore: 718,
    finalBid: 178500,
    href: "/estimate-review",
  },
  {
    id: "project-38",
    name: "Oakland Mixed Use 38",
    customer: "Webcor",
    location: "Oakland, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/28/26",
    lastUpdated: "06/28/26",
    bidPhase: "75% CD",
    unionStatus: "Non-Union",
    status: "Draft" as ProjectStatus,
    linearFeet: 871,
    frames: 348,
    planks: 435,
    equipmentScore: 783,
    finalBid: 192250,
    href: "/estimate-review",
  },
  {
    id: "project-39",
    name: "San Jose Civic 39",
    customer: "McCarthy",
    location: "San Jose, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/03/26",
    lastUpdated: "06/04/26",
    bidPhase: "100% CD",
    unionStatus: "Non-Union",
    status: "Submitted" as ProjectStatus,
    linearFeet: 944,
    frames: 378,
    planks: 472,
    equipmentScore: 850,
    finalBid: 206000,
    href: "/estimate-review",
  },
  {
    id: "project-40",
    name: "Berkeley Housing 40",
    customer: "XL",
    location: "Berkeley, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/06/26",
    lastUpdated: "06/07/26",
    bidPhase: "GMP",
    unionStatus: "Union",
    status: "Internal Review" as ProjectStatus,
    linearFeet: 1017,
    frames: 407,
    planks: 509,
    equipmentScore: 916,
    finalBid: 219750,
    href: "/estimate-review",
  },
  {
    id: "project-41",
    name: "Vacaville Senior 41",
    customer: "Devcon",
    location: "Vacaville, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/09/26",
    lastUpdated: "06/10/26",
    bidPhase: "Final Round",
    unionStatus: "Non-Union",
    status: "Ready To Send" as ProjectStatus,
    linearFeet: 1090,
    frames: 436,
    planks: 545,
    equipmentScore: 981,
    finalBid: 233500,
    href: "/estimate-review",
  },
  {
    id: "project-42",
    name: "Napa Retail 42",
    customer: "Swinerton",
    location: "Napa, CA",
    estimator: "H. Pierre",
    bidDueDate: "06/12/26",
    lastUpdated: "06/13/26",
    bidPhase: "Awarded",
    unionStatus: "Non-Union",
    status: "No Response" as ProjectStatus,
    linearFeet: 1163,
    frames: 465,
    planks: 581,
    equipmentScore: 1046,
    finalBid: 247250,
    href: "/estimate-review",
  },
  {
    id: "project-43",
    name: "Sacramento Medical 43",
    customer: "DPR",
    location: "Sacramento, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/15/26",
    lastUpdated: "05/16/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Union",
    status: "Still Chasing" as ProjectStatus,
    linearFeet: 1236,
    frames: 494,
    planks: 618,
    equipmentScore: 1112,
    finalBid: 261000,
    href: "/estimate-review",
  },
  {
    id: "project-44",
    name: "Fremont Tech 44",
    customer: "Clark",
    location: "Fremont, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/18/26",
    lastUpdated: "05/19/26",
    bidPhase: "50% CD",
    unionStatus: "Non-Union",
    status: "Won" as ProjectStatus,
    linearFeet: 1309,
    frames: 524,
    planks: 655,
    equipmentScore: 1179,
    finalBid: 274750,
    href: "/estimate-review",
  },
  {
    id: "project-45",
    name: "Petaluma Mixed Use 45",
    customer: "Nibbi",
    location: "Petaluma, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/21/26",
    lastUpdated: "05/22/26",
    bidPhase: "75% CD",
    unionStatus: "Non-Union",
    status: "Lost" as ProjectStatus,
    linearFeet: 1382,
    frames: 553,
    planks: 691,
    equipmentScore: 1244,
    finalBid: 288500,
    href: "/estimate-review",
  },
  {
    id: "project-46",
    name: "Richmond School 46",
    customer: "Flint",
    location: "Richmond, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/24/26",
    lastUpdated: "05/25/26",
    bidPhase: "100% CD",
    unionStatus: "Union",
    status: "Draft" as ProjectStatus,
    linearFeet: 1455,
    frames: 582,
    planks: 728,
    equipmentScore: 1310,
    finalBid: 302250,
    href: "/estimate-review",
  },
  {
    id: "project-47",
    name: "Walnut Creek MOB 47",
    customer: "Level 10",
    location: "Walnut Creek, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/27/26",
    lastUpdated: "05/28/26",
    bidPhase: "GMP",
    unionStatus: "Non-Union",
    status: "Submitted" as ProjectStatus,
    linearFeet: 1528,
    frames: 611,
    planks: 764,
    equipmentScore: 1375,
    finalBid: 316000,
    href: "/estimate-review",
  },
  {
    id: "project-48",
    name: "Fairfield Hotel 48",
    customer: "Balfour",
    location: "Fairfield, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/02/26",
    lastUpdated: "05/03/26",
    bidPhase: "Final Round",
    unionStatus: "Non-Union",
    status: "Internal Review" as ProjectStatus,
    linearFeet: 1601,
    frames: 640,
    planks: 800,
    equipmentScore: 1440,
    finalBid: 329750,
    href: "/estimate-review",
  },
  {
    id: "project-49",
    name: "Mare Island Apartments 49",
    customer: "Turner",
    location: "Vallejo, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/05/26",
    lastUpdated: "05/06/26",
    bidPhase: "Awarded",
    unionStatus: "Union",
    status: "Ready To Send" as ProjectStatus,
    linearFeet: 1674,
    frames: 670,
    planks: 838,
    equipmentScore: 1508,
    finalBid: 343500,
    href: "/estimate-review",
  },
  {
    id: "project-50",
    name: "Oakland Mixed Use 50",
    customer: "Webcor",
    location: "Oakland, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/08/26",
    lastUpdated: "05/09/26",
    bidPhase: "Budget / ROM",
    unionStatus: "Non-Union",
    status: "No Response" as ProjectStatus,
    linearFeet: 1747,
    frames: 699,
    planks: 874,
    equipmentScore: 1573,
    finalBid: 357250,
    href: "/estimate-review",
  },
  {
    id: "project-51",
    name: "San Jose Civic 51",
    customer: "McCarthy",
    location: "San Jose, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/11/26",
    lastUpdated: "05/12/26",
    bidPhase: "50% CD",
    unionStatus: "Non-Union",
    status: "Still Chasing" as ProjectStatus,
    linearFeet: 1820,
    frames: 728,
    planks: 910,
    equipmentScore: 1638,
    finalBid: 371000,
    href: "/estimate-review",
  },
  {
    id: "project-52",
    name: "Berkeley Housing 52",
    customer: "XL",
    location: "Berkeley, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/14/26",
    lastUpdated: "05/15/26",
    bidPhase: "75% CD",
    unionStatus: "Union",
    status: "Won" as ProjectStatus,
    linearFeet: 1893,
    frames: 757,
    planks: 946,
    equipmentScore: 1703,
    finalBid: 384750,
    href: "/estimate-review",
  },
  {
    id: "project-53",
    name: "Vacaville Senior 53",
    customer: "Devcon",
    location: "Vacaville, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/17/26",
    lastUpdated: "05/18/26",
    bidPhase: "100% CD",
    unionStatus: "Non-Union",
    status: "Lost" as ProjectStatus,
    linearFeet: 1966,
    frames: 786,
    planks: 982,
    equipmentScore: 1768,
    finalBid: 398500,
    href: "/estimate-review",
  },
  {
    id: "project-54",
    name: "Napa Retail 54",
    customer: "Swinerton",
    location: "Napa, CA",
    estimator: "H. Pierre",
    bidDueDate: "05/20/26",
    lastUpdated: "05/21/26",
    bidPhase: "GMP",
    unionStatus: "Non-Union",
    status: "Draft" as ProjectStatus,
    linearFeet: 2039,
    frames: 816,
    planks: 1020,
    equipmentScore: 1836,
    finalBid: 412250,
    href: "/estimate-review",
  }
];

export default function ProjectsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("Most Recent");

  const filteredProjects = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    const results = projects.filter((project) => {
      if (!search) return true;

      return (
        project.name.toLowerCase().includes(search) ||
        project.customer.toLowerCase().includes(search) ||
        project.location.toLowerCase().includes(search) ||
        project.bidPhase.toLowerCase().includes(search) ||
        project.status.toLowerCase().includes(search)
      );
    });

    return [...results].sort((a, b) => {
      if (sortOption === "Follow-Ups") {
        return Number(b.status === "No Response") - Number(a.status === "No Response");
      }

      if (sortOption === "Alphabetical") return a.name.localeCompare(b.name);
      if (sortOption === "Most Equipment") return b.equipmentScore - a.equipmentScore;
      if (sortOption === "Largest Bid") return b.finalBid - a.finalBid;
      if (sortOption === "Lowest Bid") return a.finalBid - b.finalBid;
      if (sortOption === "Bid Due Date") return new Date(a.bidDueDate).getTime() - new Date(b.bidDueDate).getTime();

      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    });
  }, [searchTerm, sortOption]);

  const totals = useMemo(() => {
    const openEstimates = projects.filter(
      (project) =>
        project.status === "Draft" ||
        project.status === "Internal Review" ||
        project.status === "Ready To Send" ||
        project.status === "Submitted" ||
        project.status === "Still Chasing" ||
        project.status === "No Response"
    );

    const noResponse = projects.filter((project) => project.status === "No Response");
    const wonValue = projects
      .filter((project) => project.status === "Won")
      .reduce((sum, project) => sum + project.finalBid, 0);

    return {
      openEstimates: openEstimates.length,
      noResponse: noResponse.length,
      wonValue,
      totalProjects: projects.length,
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#080604] text-white">
      <section className="border-b border-orange-500/20 bg-black px-8 py-5">
        <div className="flex items-center justify-between gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.5em] text-orange-500">KORBAN</p>
            <h1 className="mt-2 text-3xl font-bold">Projects</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Compact estimating board for high-volume bid tracking and quick Estimate Review access.
            </p>
          </div>

          <a
            href="/estimate-review"
            className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-black hover:bg-orange-400"
          >
            + New Estimate
          </a>
        </div>
      </section>

      <section className="space-y-5 p-6">
        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Total Projects" value={String(totals.totalProjects)} />
          <MetricCard label="Open Estimates" value={String(totals.openEstimates)} />
          <MetricCard label="Follow-Ups Needed" value={String(totals.noResponse)} warning />
          <MetricCard label="Won Value" value={formatMoney(totals.wonValue)} />
        </div>

        <section className="rounded-[2rem] border border-zinc-800 bg-[#0b0b0b] p-5 shadow-2xl">
          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
                Sort Projects
              </p>

              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
                className="w-full rounded-xl border border-orange-500/20 bg-black px-4 py-3 text-sm font-bold text-zinc-300 outline-none focus:border-orange-500/50"
              >
                {sortOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
                Search
              </p>

              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by project, GC, city, status, or bid phase..."
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-300 outline-none focus:border-orange-500/50"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-4 shadow-2xl">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p className="mr-1 text-xs font-bold uppercase tracking-[0.22em] text-orange-400">
              Color Key
            </p>

            <LegendItem color="bg-emerald-400" label="Won" />
            <LegendItem color="bg-red-400" label="Lost" />
            <LegendItem color="bg-yellow-300 shadow-[0_0_14px_rgba(234,179,8,0.8)]" label="No Response" />
            <LegendItem color="bg-zinc-300" label="Still Chasing" />
            <LegendItem color="bg-blue-400" label="Submitted" />
            <LegendItem color="bg-white shadow-[0_0_12px_rgba(255,255,255,0.55)]" label="Ready To Send" />
            <LegendItem color="bg-orange-400" label="Internal Review" />
            <LegendItem color="bg-zinc-500" label="Draft" />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-9 min-[1900px]:grid-cols-12">
          {filteredProjects.map((project) => (
            <ProjectSnapshotTile key={project.id} project={project} />
          ))}
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div
      className={`rounded-3xl border bg-black p-5 shadow-2xl ${
        warning
          ? "border-yellow-500/30 shadow-[0_0_24px_rgba(234,179,8,0.10)]"
          : "border-orange-500/20"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <h2 className={`mt-3 font-mono text-3xl font-bold ${warning ? "text-yellow-300" : "text-orange-500"}`}>
        {value}
      </h2>
    </div>
  );
}

function ProjectSnapshotTile({ project }: { project: (typeof projects)[number] }) {
  const isNoResponse = project.status === "No Response";

  return (
    <a
      href={project.href}
      className={`group block rounded-2xl border bg-[#0b0b0b] p-3 transition hover:bg-orange-500/5 ${
        isNoResponse
          ? "animate-pulse border-yellow-500/45 shadow-[0_0_22px_rgba(234,179,8,0.18)]"
          : getTileBorder(project.status)
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">{project.name}</p>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{project.customer}</p>
        </div>

        <StatusDot status={project.status} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
        <MiniInfo label="Phase" value={project.bidPhase} />
        <MiniInfo label="Due" value={project.bidDueDate} />
        <MiniInfo label="LF" value={formatNumber(project.linearFeet)} />
        <MiniInfo label="FR" value={formatNumber(project.frames)} />
      </div>

      <div className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/10 p-2">
        <p className="text-[9px] uppercase tracking-[0.16em] text-orange-300/70">Total</p>
        <p className="mt-1 truncate font-mono text-lg font-bold text-orange-400">
          {formatMoney(project.finalBid)}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px] text-zinc-600">
        <span>{project.unionStatus === "Union" ? "U" : "NU"}</span>
        <span>{project.status}</span>
      </div>
    </a>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-black p-2">
      <p className="text-[8px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>
      <p className="mt-0.5 truncate font-mono text-[10px] font-bold text-zinc-300">{value}</p>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      <span className="text-xs text-zinc-400">{label}</span>
    </div>
  );
}

function StatusDot({ status }: { status: ProjectStatus }) {
  return <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getStatusDot(status)}`} />;
}

function getTileBorder(status: ProjectStatus) {
  if (status === "Won") return "border-emerald-500/50";
  if (status === "Lost") return "border-red-500/50";
  if (status === "No Response") return "border-yellow-500/50";
  return "border-zinc-800";
}

function getStatusDot(status: ProjectStatus) {
  const styles: Record<ProjectStatus, string> = {
    Draft: "bg-zinc-500",
    "Internal Review": "bg-orange-400",
    "Ready To Send": "bg-white shadow-[0_0_12px_rgba(255,255,255,0.55)]",
    Submitted: "bg-blue-400",
    Won: "bg-emerald-400",
    Lost: "bg-red-400",
    "Still Chasing": "bg-zinc-300",
    "No Response": "bg-yellow-300 shadow-[0_0_14px_rgba(234,179,8,0.8)]",
  };

  return styles[status];
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}
