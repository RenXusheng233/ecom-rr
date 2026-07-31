import AppAreaChart from '@/components/AppAreaChart'
import AppBarChart from '@/components/AppBarChart'
import AppPieChart from '@/components/AppPieChart'
import CardList, {
  LATEST_TRANSACTIONS,
  POPULAR_PRODUCTS,
} from '@/components/CardList'
import TodoList from '@/components/TodoList'
import { auth } from '@clerk/nextjs/server'

const HomePage = async () => {
  const { getToken } = await auth()
  const token = await getToken()
  const orderChartData = fetch(
    `${process.env.NEXT_PUBLIC_ORDER_SERVICE_URL}/order-chart`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  ).then((res) => res.json())

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
      <div className="bg-primary-foreground p-4 rounded-lg lg:col-span-2 xl:col-span-1 2xl:col-span-2">
        <AppBarChart dataPromise={orderChartData} />
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
