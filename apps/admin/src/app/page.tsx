import AppAreaChart from '@/components/AppAreaChart'
import AppBarChart from '@/components/AppBarChart'
import AppPieChart from '@/components/AppPieChart'
import CardList, {
  LATEST_TRANSACTIONS,
  POPULAR_PRODUCTS,
} from '@/components/CardList'
import TodoList from '@/components/TodoList'

const HomePage = () => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="bg-primary-foreground p-4 rounded-lg lg:col-span-2 xl:col-span-1 2xl:col-span-2">
        <AppBarChart />
      </div>
      <div className="bg-primary-foreground p-4 rounded-lg">
        <CardList title={LATEST_TRANSACTIONS} />
      </div>
      <div className="bg-primary-foreground p-4 rounded-lg">
        <AppPieChart />
      </div>
      <div className="bg-primary-foreground p-4 rounded-lg">
        <TodoList />
      </div>
      <div className="bg-primary-foreground p-4 rounded-lg lg:col-span-2 xl:col-span-1 2xl:col-span-2">
        <AppAreaChart />
      </div>
      <div className="bg-primary-foreground p-4 rounded-lg">
        <CardList title={POPULAR_PRODUCTS} />
      </div>
    </div>
  )
}

export default HomePage
