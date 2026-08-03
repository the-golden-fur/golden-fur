import { createElement, Fragment } from 'react';
import { Route } from 'react-router';
import { CustomerAuthGuard } from '../auth/customer/guards/CustomerAuthGuard/CustomerAuthGuard';
import { CustomerFoodMedicationPage } from '../catalog/pages/CustomerFoodMedicationPage/CustomerFoodMedicationPage';
import { CustomerPetManagerPage } from './pages/CustomerPetManagerPage/CustomerPetManagerPage';
import { PetProfilePage } from './pages/PetProfilePage/PetProfilePage';

export const customerRoutes = createElement(
  Fragment,
  null,
  createElement(
    Route,
    { element: createElement(CustomerAuthGuard) },
    createElement(Route, {
      path: '/portal/pets',
      element: createElement(CustomerPetManagerPage),
    }),
    createElement(Route, {
      path: '/portal/pets/:petId',
      element: createElement(PetProfilePage),
    }),
    createElement(Route, {
      path: '/portal/food-medication',
      element: createElement(CustomerFoodMedicationPage),
    })
  )
);
