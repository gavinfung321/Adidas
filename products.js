// Shared demo catalogue. Prices are sample HKD values for this concept, not adidas retail prices,
// and sizes are demo options rather than verified availability.
(function (root, factory) {
  const catalogue = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalogue;
  else root.IntoTheBlueCatalogue = catalogue;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CURRENCY = 'HKD';
  const SIZES = ['S', 'M', 'L', 'XL'];

  function product(id, fields) {
    return Object.freeze({
      id,
      ...fields,
      currency: CURRENCY,
      demoPricing: true,
      variants: Object.freeze(SIZES.map(size => Object.freeze({ id: `${id}-${size.toLowerCase()}`, size })))
    });
  }

  function gallery(entries) {
    return Object.freeze(entries.map(([file, label, alt]) => Object.freeze({ src: `assets/${file}`, label, alt })));
  }

  const products = Object.freeze([
    product('blue-jacket', {
      name: 'FK Denim Down JKT',
      description: 'A loose-fit down jacket with a washed denim-look finish, diagonal zip pockets and the Originals Trefoil.',
      image: 'assets/front.png',
      imageAlt: 'Front of the blue padded jacket',
      unitPriceMinor: 128000
    }),
    product('winter-brown', {
      name: 'Brown & black.',
      description: 'A brown and black colour-block padded jacket with a high collar, central zipper, large stitched panels, an inner zip pocket and white chest Trefoil.',
      image: 'assets/winter-brown-flat.png',
      imageAlt: 'Brown padded jacket with black shoulders, sleeves and high collar',
      unitPriceMinor: 98000,
      gallery: gallery([
        ['winter-brown-worn-front.png', 'Front', 'Model wearing the brown and black jacket zipped up, front view'],
        ['winter-brown-worn-back.png', 'Back', 'Rear view of the brown and black jacket with a small fabric label at the hem'],
        ['winter-brown-full.png', 'Full-length', 'Full-length look with the jacket, wide black jeans and trainers'],
        ['winter-brown-flat.png', 'Product', 'Brown padded jacket with black shoulders, sleeves and high collar'],
        ['winter-brown-pocket.jpg', 'Inside', 'Close-up of the inner zip pocket and the brown lining']
      ])
    }),
    product('winter-black', {
      name: 'Quietly black.',
      description: 'A black down jacket with a high stand collar, horizontal baffles, zip hand pockets, elastic cuffs and a white adidas logo on the chest.',
      image: 'assets/winter-black-flat.png',
      imageAlt: 'Black down jacket with a high stand collar and white chest logo',
      unitPriceMinor: 88000,
      gallery: gallery([
        ['winter-black-worn-front.png', 'Front', 'Model wearing the black down jacket zipped up, front view'],
        ['winter-black-worn-back.png', 'Back', 'Rear view of the black down jacket showing its horizontal baffles'],
        ['winter-black-worn-side.png', 'Side', 'Three-quarter view of the black down jacket worn open with a hand in the pocket'],
        ['winter-black-flat.png', 'Product', 'Black down jacket with a high stand collar and white chest logo'],
        ['winter-black-collar.jpg', 'Collar', 'Close-up of the stand collar, zip and white adidas logo'],
        ['winter-black-cuff.jpg', 'Cuff', 'Close-up of the elastic cuff']
      ])
    }),
    product('winter-grey', {
      name: 'Grey, two ways.',
      description: 'A grey hooded down jacket with curved panel seams, large front pockets and zip-off sleeves that turn it into a vest. Finished with a drawcord hem and a reflective logo on the sleeve.',
      image: 'assets/winter-grey-flat.jpg',
      imageAlt: 'Grey hooded down jacket with curved panel seams and large front pockets',
      unitPriceMinor: 98000,
      gallery: gallery([
        ['winter-grey-worn-front.jpg', 'Front', 'Model wearing the grey hooded down jacket, front view'],
        ['winter-grey-worn-back.png', 'Back', 'Rear view of the grey jacket with the hood up'],
        ['winter-grey-full.png', 'Full-length', 'Full-length look with the grey jacket, matching trousers and a shoulder bag'],
        ['winter-grey-flat.jpg', 'Product', 'Grey hooded down jacket with curved panel seams and large front pockets'],
        ['winter-grey-vest-flat.png', 'Vest', 'The grey jacket with its sleeves removed, worn as a hooded vest'],
        ['winter-grey-vest-worn.jpg', 'Worn vest', 'Model wearing the grey vest over a short-sleeved top'],
        ['winter-grey-sleeve.jpg', 'Detail', 'Close-up of the drawcord hem and reflective logo on the sleeve']
      ])
    })
  ]);

  const byId = new Map(products.map(p => [p.id, p]));
  const formatter = new Intl.NumberFormat('en-HK', { style: 'currency', currency: CURRENCY });

  return Object.freeze({
    currency: CURRENCY,
    products,
    getProduct: id => byId.get(id) || null,
    formatMoney: minor => formatter.format(minor / 100)
  });
});
