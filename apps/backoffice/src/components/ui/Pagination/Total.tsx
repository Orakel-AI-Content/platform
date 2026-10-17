// Ecme v1.3.10 (e5f9a1d): src/components/ui/Pagination/Total.tsx
// Adaptado (#214): texto em português, "Total de N itens" (ou "1 item").
const Total = (props: { total: number }) => {
  const { total } = props;
  return (
    <div className="pagination-total">
      Total de <span>{total}</span> {total === 1 ? 'item' : 'itens'}
    </div>
  );
};

export default Total;
