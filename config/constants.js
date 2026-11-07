var selectOptions = {
  turnos: [
    { value: 'mañana', label: 'Mañana' },
    { value: 'tarde', label: 'Tarde' }
  ],
  estadosPersonal: [
    { value: 'activo', label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' }
  ],
  categoriasProducto: [
    { value: 'parrillas', label: 'Parrillas' },
    { value: 'bebidas', label: 'Bebidas' },
    { value: 'guarniciones', label: 'Guarniciones' },
    { value: 'postres', label: 'Postres' }
  ],
  disponibilidad: [
    { value: '1', label: 'Sí' },
    { value: '0', label: 'No' }
  ],
  estadosTicket: [
    { value: 'pendiente', label: 'Pendiente' },
    { value: 'en_parrilla', label: 'En parrilla' },
    { value: 'listo', label: 'Listo' },
    { value: 'entregado', label: 'Entregado' }
  ]
};

module.exports = selectOptions;
